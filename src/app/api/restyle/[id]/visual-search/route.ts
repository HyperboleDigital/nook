import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/restyle-render";
import { describeScreenshotForSearch, scoreImageMatches } from "@/lib/gemini";
import { searchByImage, searchShopping, ShoppingSearchError, type ShoppingResult } from "@/lib/shopping-search";

// Google Lens visual match + (fallback) Gemini identify + four parallel SerpApi searches.
export const maxDuration = 90;

async function loadOwned(restyleId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("restyles").select("id").eq("id", restyleId).eq("user_id", userId).single();
  return data;
}

const titleKey = (t: string) => t.toLowerCase().replace(/\s+/g, " ").slice(0, 40);

// POST — screenshot → find the actual product (Google Lens) across retailers, falling back to
// keyword "similar" search when no real match is found. Does NOT render; client calls
// POST /api/restyle/[id]/product when the user picks one.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("image") as File | null;
  const query = (form.get("query") as string | null)?.trim();

  // Text-only path (from "Describe it"): keyword search, no Lens/scoring (no target image).
  if (!file && query) {
    try {
      const results = await searchShopping(query);
      return NextResponse.json({ results });
    } catch (err) {
      if (err instanceof ShoppingSearchError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Product search failed." }, { status: 502 });
    }
  }

  if (!file) return NextResponse.json({ error: "An image is required." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That file isn't an image." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  // 1) Exact match via Google Lens — needs a public image URL, so upload then delete it.
  let exact: ShoppingResult[] = [];
  let shotUrl: string | null = null;
  try {
    shotUrl = await uploadImage(userId, buf, mimeType);
    exact = await searchByImage(shotUrl);
  } catch {
    /* Lens is best-effort; we fall back to text search below */
  } finally {
    if (shotUrl) { try { await del(shotUrl); } catch { /* leave it; non-fatal */ } }
  }

  // 2) Add keyword "similar" options when we didn't find enough renderable exact matches.
  let results = exact;
  if (exact.filter((r) => r.supported).length < 2) {
    try {
      const parsed = await describeScreenshotForSearch({ imageBase64: buf.toString("base64"), mimeType });
      const similar = await searchShopping(`${parsed.description} ${parsed.itemType}`.trim());
      const seen = new Set(exact.map((r) => titleKey(r.title)));
      results = [...exact, ...similar.filter((s) => !seen.has(titleKey(s.title)))];
    } catch (err) {
      if (exact.length === 0) {
        if (err instanceof ShoppingSearchError) return NextResponse.json({ error: err.message }, { status: err.status });
        return NextResponse.json(
          { error: "Couldn't identify an item in that image. Try a clearer screenshot." },
          { status: 422 },
        );
      }
      /* keep the exact matches we already have */
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: "No matching products found. Try a clearer screenshot." }, { status: 404 });
  }

  // Grade each candidate 0–10 against the uploaded photo (Lens's "exact" is just relevance).
  results = results.slice(0, 8);
  try {
    const thumbs = await Promise.all(results.map(async (r) => {
      if (!r.thumbnail) return null;
      try {
        const tr = await fetch(r.thumbnail, { signal: AbortSignal.timeout(6_000) });
        if (!tr.ok) return null;
        return { base64: Buffer.from(await tr.arrayBuffer()).toString("base64"), mimeType: tr.headers.get("content-type") || "image/jpeg" };
      } catch { return null; }
    }));
    const idx = results.map((_, i) => i).filter((i) => thumbs[i]);
    if (idx.length) {
      const scores = await scoreImageMatches({
        target: { base64: buf.toString("base64"), mimeType },
        candidates: idx.map((i) => thumbs[i]!),
      });
      idx.forEach((i, k) => { if (scores[k] != null) results[i].score = scores[k]; });
      // Best visual match first; unscored fall to the back.
      results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    }
  } catch { /* scoring is best-effort */ }

  return NextResponse.json({ results });
}
