import { auth } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import { del } from "@vercel/blob";
import { uploadImage } from "@/lib/restyle-render";
import { describeScreenshotForSearch, locateProductPhoto, scoreImageMatches } from "@/lib/gemini";
import { searchByImage, searchShopping, ShoppingSearchError, type ShoppingResult } from "@/lib/shopping-search";
import { fileToBuffer } from "@/lib/file-buf";
import { cropToBox } from "@/lib/image-crop";
import { loadOwnedRestyle } from "@/lib/restyle-edits";
import { searchProductByImageUrl, upsertSearch } from "@/lib/restyle-search";
import { getUserPlan, searchTierForPlan } from "@/lib/plan";

// Google Lens visual match + Gemini identify (parallel) + four parallel SerpApi searches.
// Scoring + Wayfair token resolution happen in after() once the response is already sent.
export const maxDuration = 90;

const titleKey = (t: string) => t.toLowerCase().replace(/\s+/g, " ").slice(0, 40);

// POST — screenshot, an already-hosted image, or a text query → find the actual product
// (Google Lens + keyword search) across supported retailers. Responds fast with unscored
// results, then refines scoring + resolves Wayfair links in the background (after()) and
// persists the final set so a later GET /api/restyle/[id]/searches?label= — or a reload —
// sees the same results without re-running the whole pipeline. Never stages a reference
// edit — that happens in product/route.ts (a photo upload stages, this only ever searches).
//   - `image` (file): a fresh screenshot/photo (e.g. the "Describe it" fallback path never
//     reaches here with a file — only `imageUrl` or `query` do in the current UI, but a raw
//     file upload is still supported for future callers).
//   - `imageUrl`: search using a photo that's already staged (already cropped, already
//     hosted) — used after generate to look up buyable options for inspo-only items that
//     ended up in the render.
//   - `query` only: text search (from "Describe it"), no Lens/scoring.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwnedRestyle(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Plan gate: free = one keyword-only match + a "locked" flag (the UI shows an upgrade card for
  // more); paid = full Lens + keyword search. See searchTierForPlan for the cost reasoning.
  const tier = searchTierForPlan(await getUserPlan(userId));

  const form = await req.formData();
  const file = form.get("image") as File | null;
  const imageUrl = (form.get("imageUrl") as string | null)?.trim() || undefined;
  const box2dRaw = (form.get("box2d") as string | null) ?? null;
  const query = (form.get("query") as string | null)?.trim();
  const label = ((form.get("label") as string | null) ?? "").trim().toLowerCase();

  // Text-only path (from "Describe it"): keyword search, no Lens/scoring (no target image).
  if (!file && !imageUrl && query) {
    try {
      const all = await searchShopping(query);
      const supported = all.filter((r) => r.supported).slice(0, tier.limit);
      if (supported.length === 0) {
        return NextResponse.json({ error: "No shoppable products found. Try a different search." }, { status: 404 });
      }
      // Text search has no Lens scoring to defer and we no longer eagerly resolve tokens (lazy
      // on pick — see restyle-search.ts), so these results are already final. Persist as scored.
      await upsertSearch(id, label, { query, results: supported, scored: true });
      return NextResponse.json({ results: supported, scored: true, locked: tier.locked });
    } catch (err) {
      if (err instanceof ShoppingSearchError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Product search failed." }, { status: 502 });
    }
  }

  // An imageUrl (no fresh file) is normally an already-staged edit's reference photo — already
  // cropped to just the product, already hosted. But `box2d` means this is instead the ORIGINAL
  // room photo plus a detected object's own box — "find similar" for an item that's never been
  // touched at all (see SimilarItemsPanel), so it isn't gated behind swapping something first.
  // Crop it down to just that item here, then delegate to the same shared pipeline either way.
  if (!file && imageUrl) {
    let searchImageUrl = imageUrl;
    if (box2dRaw) {
      try {
        const box2d = JSON.parse(box2dRaw) as [number, number, number, number];
        const res = await fetch(imageUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const cropped = await cropToBox(buf, box2d);
          searchImageUrl = await uploadImage(userId, cropped, "image/jpeg");
        }
      } catch { /* fall back to searching the uncropped photo rather than failing outright */ }
    }
    const search = await searchProductByImageUrl({ restyleId: id, imageUrl: searchImageUrl, label, tier });
    if (!search.ok) return NextResponse.json({ error: search.error }, { status: search.status });
    after(search.finish);
    return NextResponse.json({ results: search.results, scored: false, locked: tier.locked });
  }

  if (!file) return NextResponse.json({ error: "An image is required." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That file isn't an image." }, { status: 400 });

  const rawBuf = await fileToBuffer(file);
  const mimeType = file.type || "image/jpeg";
  const rawBase64 = rawBuf.toString("base64");

  // Full-page/app screenshots carry UI chrome (nav bars, price, buttons) that pollutes both
  // Lens visual matching and identification — locate the product photo and identify the item
  // in parallel (independent Gemini calls over the same bytes; used to run serially, and
  // separately duplicated again in the product route for the same screenshot).
  const [box, identified] = await Promise.all([
    locateProductPhoto({ imageBase64: rawBase64, mimeType }).catch(() => null),
    describeScreenshotForSearch({ imageBase64: rawBase64, mimeType }).catch(() => null),
  ]);
  if (!identified && !box) {
    return NextResponse.json({ error: "Couldn't identify an item in that image. Try a clearer screenshot." }, { status: 422 });
  }

  let lensBuf = rawBuf;
  if (box) { try { lensBuf = await cropToBox(rawBuf, box); } catch { /* best-effort */ } }
  const lensBase64 = lensBuf.toString("base64");

  // Upload once — reused for the Lens search and (if staging) the edit's reference photo.
  let shotUrl: string | null = null;
  try {
    shotUrl = await uploadImage(userId, lensBuf, mimeType);
  } catch { /* Lens + staging both degrade gracefully without a hosted copy */ }

  const searchQuery = identified
    ? [identified.productTitle, identified.description, identified.itemType].filter(Boolean).join(" ").trim()
    : "";

  // Always run both — this used to gate the keyword fallback behind "<2 exact matches",
  // which serialized it after Lens instead of overlapping the two independent searches.
  const [exact, keyword] = await Promise.all([
    // Lens is a second SerpApi call — skipped on the free tier (see searchTierForPlan).
    shotUrl && tier.useLens ? searchByImage(shotUrl).catch((err) => { console.error("[visual-search] Lens failed:", err); return []; }) : Promise.resolve([] as ShoppingResult[]),
    searchQuery ? searchShopping(searchQuery).catch((err) => { console.error("[visual-search] keyword search failed:", err); return []; }) : Promise.resolve([] as ShoppingResult[]),
  ]);

  if (shotUrl) { try { await del(shotUrl); } catch { /* leave it; non-fatal */ } }

  const seen = new Set(exact.map((r) => titleKey(r.title)));
  let results = [...exact, ...keyword.filter((r) => !seen.has(titleKey(r.title)))];

  // Never surface "not shoppable" results — a link/price is the whole point. Cap by plan tier.
  results = results.filter((r) => r.supported).slice(0, tier.limit);
  if (results.length === 0) {
    return NextResponse.json({ error: "No matching products found. Try a clearer screenshot." }, { status: 404 });
  }

  await upsertSearch(id, label, { query: searchQuery, results, scored: false });

  // Scoring (Gemini) + Wayfair token resolution happen after the response is sent — the
  // client already has unscored results to show; this just re-ranks/enriches them in place.
  const resultsForScoring = results;
  after(async () => {
    let final = resultsForScoring;
    try {
      const thumbs = await Promise.all(final.map(async (r) => {
        if (!r.thumbnail) return null;
        try {
          const tr = await fetch(r.thumbnail, { signal: AbortSignal.timeout(6_000) });
          if (!tr.ok) return null;
          return { base64: Buffer.from(await tr.arrayBuffer()).toString("base64"), mimeType: tr.headers.get("content-type") || "image/jpeg" };
        } catch { return null; }
      }));
      const idx = final.map((_, i) => i).filter((i) => thumbs[i]);
      if (idx.length) {
        const scores = await scoreImageMatches({
          target: { base64: lensBase64, mimeType },
          candidates: idx.map((i) => thumbs[i]!),
        });
        idx.forEach((i, k) => { if (scores[k] != null) final[i].score = scores[k]; });
        final = [...final].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      }
    } catch (err) { console.error("[visual-search] scoring failed:", err); }
    // Wayfair immersive tokens are resolved LAZILY on pick now (see restyle-search.ts note), not
    // eagerly for every candidate — that used to spend a SerpApi call per unpicked token result.
    await upsertSearch(id, label, { query: searchQuery, results: final, scored: true });
  });

  return NextResponse.json({ results, scored: false, locked: tier.locked });
}
