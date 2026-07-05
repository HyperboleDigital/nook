import { supabaseAdmin } from "@/lib/supabase";
import { describeScreenshotForSearch, scoreImageMatches } from "@/lib/gemini";
import { resolveTokenUrls, searchByImage, searchShopping, type ShoppingResult } from "@/lib/shopping-search";

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
 * `reference_url`) — the shared pipeline behind both the visual-search route's `imageUrl`
 * path and generate's deferred inspo search (run server-side in generate's `after()` so it
 * survives the client disconnecting). Returns fast, unscored results (already persisted) plus
 * a `finish()` continuation that does Gemini scoring + Wayfair token resolution and persists
 * the final set — callers decide whether to await `finish()` inline or hand it to `after()`.
 */
export async function searchProductByImageUrl(params: {
  restyleId: string; imageUrl: string; label: string;
}): Promise<
  | { ok: true; results: ShoppingResult[]; finish: () => Promise<void> }
  | { ok: false; error: string; status: number }
> {
  const { restyleId, imageUrl, label } = params;
  const res = await fetch(imageUrl);
  if (!res.ok) return { ok: false, error: "Couldn't load that image.", status: 502 };
  const rawBuf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const rawBase64 = rawBuf.toString("base64");

  const identified = await describeScreenshotForSearch({ imageBase64: rawBase64, mimeType }).catch(() => null);
  if (!identified) return { ok: false, error: "Couldn't identify an item in that image.", status: 422 };

  const searchQuery = [identified.productTitle, identified.description, identified.itemType].filter(Boolean).join(" ").trim();

  const [exact, keyword] = await Promise.all([
    searchByImage(imageUrl).catch((err) => { console.error("[restyle-search] Lens failed:", err); return [] as ShoppingResult[]; }),
    searchQuery
      ? searchShopping(searchQuery).catch((err) => { console.error("[restyle-search] keyword search failed:", err); return [] as ShoppingResult[]; })
      : Promise.resolve([] as ShoppingResult[]),
  ]);

  const seen = new Set(exact.map((r) => titleKey(r.title)));
  let results = [...exact, ...keyword.filter((r) => !seen.has(titleKey(r.title)))];
  results = results.filter((r) => r.supported).slice(0, 8);
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
    final = await resolveTokenUrls(final);
    await upsertSearch(restyleId, label, { query: searchQuery, results: final, scored: true });
  };

  return { ok: true, results, finish };
}
