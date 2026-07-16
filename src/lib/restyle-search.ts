import { supabaseAdmin } from "@/lib/supabase";
import { describeScreenshotForSearch, scoreImageMatches } from "@/lib/gemini";
import { searchByImage, searchShopping, type ShoppingResult } from "@/lib/shopping-search";
import type { SearchTier } from "@/lib/plan";

const titleKey = (t: string) => t.toLowerCase().replace(/\s+/g, " ").slice(0, 40);

export async function upsertSearch(
  restyleId: string, label: string,
  fields: { query?: string | null; results: ShoppingResult[]; scored: boolean },
) {
  await supabaseAdmin.from("restyle_searches").upsert(
    { restyle_id: restyleId, label, query: fields.query ?? null, results: fields.results, scored: fields.scored, updated_at: new Date().toISOString() },
    { onConflict: "restyle_id,label" },
  );
}

/**
 * Find buyable products for an already-hosted, already-cropped reference photo (an edit's
 * `reference_url`) — the shared pipeline behind the visual-search route's `imageUrl` path,
 * generate's deferred inspo search, and the "dupe finder" auto-search on a pasted product link
 * (run server-side in `after()` so it survives the client disconnecting). Returns fast, unscored
 * results (already persisted) plus a `finish()` continuation that does Gemini scoring + Wayfair
 * token resolution and persists the final set — callers decide whether to await `finish()`
 * inline or hand it to `after()`.
 *
 * `titleHint` — when the caller already knows the product's real title (a pasted retailer link
 * via `fetchProduct`, unlike an inspo photo with no listing to read from), skip the
 * `describeScreenshotForSearch` vision call entirely and search on the confirmed title instead —
 * cheaper AND a more targeted "find this exact item elsewhere" query than re-describing the photo.
 */
export async function searchProductByImageUrl(params: {
  restyleId: string; imageUrl: string; label: string; titleHint?: string; tier: SearchTier;
}): Promise<
  | { ok: true; results: ShoppingResult[]; finish: () => Promise<void> }
  | { ok: false; error: string; status: number }
> {
  const { restyleId, imageUrl, label, titleHint, tier } = params;
  const res = await fetch(imageUrl);
  if (!res.ok) return { ok: false, error: "Couldn't load that image.", status: 502 };
  const rawBuf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const rawBase64 = rawBuf.toString("base64");

  let searchQuery: string;
  if (titleHint?.trim()) {
    searchQuery = titleHint.trim();
  } else {
    const identified = await describeScreenshotForSearch({ imageBase64: rawBase64, mimeType }).catch(() => null);
    if (!identified) return { ok: false, error: "Couldn't identify an item in that image.", status: 422 };
    searchQuery = [identified.productTitle, identified.description, identified.itemType].filter(Boolean).join(" ").trim();
  }

  const [exact, keyword] = await Promise.all([
    // Lens (the visual "find this exact item") is a second SerpApi call — skipped on the free
    // tier, which only surfaces one keyword match anyway (see searchTierForPlan).
    tier.useLens
      ? searchByImage(imageUrl).catch((err) => { console.error("[restyle-search] Lens failed:", err); return [] as ShoppingResult[]; })
      : Promise.resolve([] as ShoppingResult[]),
    searchQuery
      ? searchShopping(searchQuery).catch((err) => { console.error("[restyle-search] keyword search failed:", err); return [] as ShoppingResult[]; })
      : Promise.resolve([] as ShoppingResult[]),
  ]);

  const seen = new Set(exact.map((r) => titleKey(r.title)));
  let results = [...exact, ...keyword.filter((r) => !seen.has(titleKey(r.title)))];
  results = results.filter((r) => r.supported).slice(0, tier.limit);
  if (results.length === 0) return { ok: false, error: "No matching products found.", status: 404 };

  await upsertSearch(restyleId, label, { query: searchQuery, results, scored: false });

  const finish = async () => {
    let final = results;
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
          target: { base64: rawBase64, mimeType },
          candidates: idx.map((i) => thumbs[i]!),
        });
        idx.forEach((i, k) => { if (scores[k] != null) final[i].score = scores[k]; });
        final = [...final].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      }
    } catch (err) { console.error("[restyle-search] scoring failed:", err); }
    // NOTE: we deliberately do NOT eagerly resolve Wayfair immersive tokens here anymore — that
    // spent one SerpApi call per token-only candidate in the background, for candidates the user
    // mostly never picks. Resolution is now LAZY: the product route resolves a token the moment
    // it's actually picked (see product/route.ts's `{ token }` branch). The only cost is that a
    // token-only card shows no pre-resolved "View on X" link until picked — a fair trade for not
    // burning a SerpApi call on every candidate of every search.
    await upsertSearch(restyleId, label, { query: searchQuery, results: final, scored: true });
  };

  return { ok: true, results, finish };
}

/**
 * Cheaper-alternatives search for a committed product, done the HONEST way: by IMAGE (Google Lens)
 * off the product's own reference photo, NOT by keyword on its title. A keyword lookup returns
 * random same-category items (and a photo-sourced item has no real title anyway), which fabricates
 * savings; a Lens visual match finds the actual product across retailers, so a cheaper hit is a
 * genuine cheaper listing. ONE SerpApi call, no scoring. Persisted to `restyle_searches` so the
 * card's "Save $X" chip and "Try something else" both read it. Called post-generate for committed
 * products only, once per label (the generate route skips labels that already have a row).
 */
export async function searchCheaperByImage(params: {
  restyleId: string; label: string; imageUrl: string; tier: SearchTier;
}): Promise<void> {
  const { restyleId, label, imageUrl, tier } = params;
  let results: ShoppingResult[];
  try {
    results = await searchByImage(imageUrl);
  } catch {
    return; // Lens unavailable / no matches — leave no row; the chip just won't appear
  }
  const supported = results.filter((r) => r.supported).slice(0, tier.limit);
  if (supported.length === 0) return;
  await upsertSearch(restyleId, label, { query: null, results: supported, scored: true });
}

