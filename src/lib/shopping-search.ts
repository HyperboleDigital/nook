/**
 * SerpApi product search — turns a screenshot description into real, buyable candidates.
 *
 * `searchShopping(query)` fans out across four engines in parallel:
 *   - amazon       (organic_results[], param `k`)   → direct product URL
 *   - walmart      (organic_results[], param `query`)→ direct product URL
 *   - home_depot   (products[],        param `q`)   → direct apionline URL
 *   - google_shopping (shopping_results[], param `q`) → variety + Wayfair via immersive token
 *
 * Amazon/Walmart/Home Depot expose a direct merchant URL we can hand straight to
 * `fetchProduct` (Unwrangle). Google Shopping rarely exposes a direct URL, so for its
 * results we carry an `immersiveToken` the product route resolves lazily on pick.
 *
 * A candidate is `supported` (renderable) when we can produce a URL/token for a retailer
 * `product.ts` knows how to fetch. Unsupported results are still returned for inspiration,
 * just greyed out in the UI.
 *
 * Vendor is isolated here; swap the engine fetchers to change providers. Env: SERPAPI_API_KEY.
 */

import { isSupportedRetailerUrl } from "@/lib/product";

export interface RetailerOption {
  retailer: string;
  price: string | null;
  url: string;
  supported: boolean;            // renderable + fetchable (Amazon/Wayfair/Walmart/Home Depot)
}

export interface ShoppingResult {
  title: string;
  thumbnail: string;
  price: string | null;
  retailer: string;
  supported: boolean;
  productUrl: string | null;     // direct merchant URL (Amazon/Walmart/Home Depot)
  immersiveToken: string | null; // Google Shopping → resolve to a URL on pick (Wayfair today)
  exact: boolean;                // true = visual match (Google Lens), false = keyword "similar"
  score: number | null;          // 0–10 visual match vs the uploaded photo (graded by Gemini)
  alternates?: RetailerOption[]; // other retailers carrying the same product (Lens grouping)
}

export class ShoppingSearchError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "ShoppingSearchError";
  }
}

/** Normalise the many shapes SerpApi reports a price in to a display string. */
function fmtPrice(p: unknown): string | null {
  if (p == null) return null;
  if (typeof p === "string") return p.trim() || null;
  if (typeof p === "number") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(p);
  }
  if (typeof p === "object") {
    const o = p as { raw?: unknown; value?: unknown; price?: unknown };
    if (typeof o.raw === "string") return o.raw;
    if (typeof o.price === "string") return o.price;
    if (typeof o.value === "number") return fmtPrice(o.value);
  }
  return null;
}

async function callSerpApi(params: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new ShoppingSearchError("Shopping search isn't configured yet.", 500);

  const qs = new URLSearchParams({ ...params, api_key: apiKey, gl: "us", hl: "en" });
  let res: Response;
  try {
    res = await fetch(`https://serpapi.com/search.json?${qs}`, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ShoppingSearchError("Couldn't reach the search service. Try again.", 502);
  }
  if (!res.ok) throw new ShoppingSearchError(`Search failed (${res.status}).`, 502);
  const data = await res.json() as Record<string, unknown>;
  if (typeof data.error === "string") throw new ShoppingSearchError(`Search error: ${data.error}`, 502);
  return data;
}

type RawRow = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Home Depot returns `thumbnails` as an array of [size-variant URL] arrays; dig out one URL. */
function firstThumb(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    for (const inner of v) {
      const found = firstThumb(inner);
      if (found) return found;
    }
  }
  return "";
}

/** Each engine: SerpApi params + how to pull a normalised candidate out of its rows. */
const ENGINES: {
  name: string;
  params: (q: string) => Record<string, string>;
  rows: (data: Record<string, unknown>) => RawRow[];
  toResult: (r: RawRow) => ShoppingResult | null;
}[] = [
  {
    name: "amazon",
    params: (q) => ({ engine: "amazon", k: q }),
    rows: (d) => (Array.isArray(d.organic_results) ? d.organic_results as RawRow[] : []),
    toResult: (r) => {
      const url = str(r.link_clean) || str(r.link);
      if (!url) return null;
      return {
        title: str(r.title), thumbnail: str(r.thumbnail), price: fmtPrice(r.price),
        retailer: "Amazon", supported: isSupportedRetailerUrl(url), productUrl: url, immersiveToken: null, exact: false, score: null,
      };
    },
  },
  {
    name: "walmart",
    params: (q) => ({ engine: "walmart", query: q }),
    rows: (d) => (Array.isArray(d.organic_results) ? d.organic_results as RawRow[] : []),
    toResult: (r) => {
      const url = str(r.product_page_url) || str(r.link);
      if (!url) return null;
      const offer = r.primary_offer as { offer_price?: unknown } | undefined;
      return {
        title: str(r.title), thumbnail: str(r.thumbnail), price: fmtPrice(offer?.offer_price ?? r.price),
        retailer: "Walmart", supported: isSupportedRetailerUrl(url), productUrl: url, immersiveToken: null, exact: false, score: null,
      };
    },
  },
  {
    name: "home_depot",
    params: (q) => ({ engine: "home_depot", q }),
    rows: (d) => (Array.isArray(d.products) ? d.products as RawRow[] : []),
    toResult: (r) => {
      const url = str(r.link);
      if (!url) return null;
      const thumb = str(r.thumbnail) || firstThumb(r.thumbnails);
      return {
        title: str(r.title), thumbnail: thumb, price: fmtPrice(r.price),
        retailer: "The Home Depot", supported: isSupportedRetailerUrl(url), productUrl: url, immersiveToken: null, exact: false, score: null,
      };
    },
  },
  {
    name: "google_shopping",
    params: (q) => ({ engine: "google_shopping", q, num: "20" }),
    rows: (d) => (Array.isArray(d.shopping_results) ? d.shopping_results as RawRow[] : []),
    toResult: (r) => {
      const token = str(r.immersive_product_page_token) || null;
      const url = str(r.product_link) || null;
      // Renderable only if a known retailer URL OR a Wayfair listing we can resolve via token.
      const source = str(r.source);
      const supported =
        (url ? isSupportedRetailerUrl(url) : false) ||
        (!!token && /wayfair/i.test(source));
      return {
        title: str(r.title), thumbnail: str(r.thumbnail), price: fmtPrice(r.price),
        retailer: source || "Google Shopping",
        supported,
        // Keep the product link even when the retailer isn't one we can fetch rich detail from —
        // it's still a real, clickable "buy here" URL for the shopper (only `supported` gates
        // whether we can stage/"Try on photo" it). Dropping it here is what left whole categories
        // (TVs, electronics — sold at Best Buy/Target, not our fetchable set) with no link at all.
        productUrl: url,
        immersiveToken: token,
        exact: false, score: null,
      };
    },
  },
];

// Keyword fan-out is deliberately limited to Google Shopping ONLY (down from Amazon + Walmart +
// Home Depot + Google Shopping). Each engine is a separate SerpApi search, so at ~4 keyword calls
// + 1 Lens call we spent ~5 searches per "shop similar" lookup and burned the quota fast. Google
// Shopping already aggregates those same retailers (Amazon/Walmart/Wayfair/Home Depot/etc.), so
// this keeps ~all the coverage at ONE keyword call — combined with the Lens visual match that's
// 2 SerpApi searches per lookup, not 5. To re-widen the fan-out (at higher SerpApi cost), add
// engine names here. The other ENGINES defs are kept for that, and for `supported` classification.
const KEYWORD_ENGINE_NAMES = new Set(["google_shopping"]);
const KEYWORD_ENGINES = ENGINES.filter((e) => KEYWORD_ENGINE_NAMES.has(e.name));

export async function searchShopping(query: string): Promise<ShoppingResult[]> {
  const settled = await Promise.all(
    KEYWORD_ENGINES.map(async (e) => {
      try {
        const data = await callSerpApi(e.params(query));
        return e.rows(data).map(e.toResult).filter((r): r is ShoppingResult => r !== null && !!r.title);
      } catch {
        return [] as ShoppingResult[]; // one engine failing shouldn't sink the whole search
      }
    }),
  );

  if (settled.every((arr) => arr.length === 0)) {
    throw new ShoppingSearchError("No matching products found. Try a clearer screenshot.", 404);
  }

  // Interleave engines (take a few from each) so one retailer doesn't dominate the list, then
  // dedupe by normalised title and sort renderable candidates first. CAP is sized so a SINGLE
  // engine (the current keyword fan-out) can still fill the list — a per-engine cap of 4 (from
  // when this fanned across 4 engines) would otherwise cap the whole result set at 4.
  const CAP = 8;
  const seen = new Set<string>();
  const out: ShoppingResult[] = [];
  const perEngine = settled.map((arr) => arr.slice(0, CAP));
  for (let i = 0; i < CAP; i++) {
    for (const arr of perEngine) {
      const r = arr[i];
      if (!r) continue;
      const key = r.title.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }

  out.sort((a, b) => Number(b.supported) - Number(a.supported));
  return out.slice(0, CAP);
}

interface LensMatch {
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
  price?: unknown;
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);

/**
 * Find the *actual* product from a screenshot via Google Lens visual matches, then group the
 * same product across retailers. Needs a publicly-reachable image URL. Renderable retailers
 * (Amazon/Wayfair/Walmart/Home Depot) come first; the rest ride along as inspiration/alternates.
 */
export async function searchByImage(imageUrl: string): Promise<ShoppingResult[]> {
  let matches: LensMatch[];
  try {
    const data = await callSerpApi({ engine: "google_lens", type: "visual_matches", url: imageUrl, country: "us" });
    matches = Array.isArray(data.visual_matches) ? (data.visual_matches as LensMatch[]) : [];
  } catch {
    return []; // caller falls back to text search
  }

  // Bucket by normalised title so the same item from many stores becomes one card + alternates.
  const buckets = new Map<string, RetailerOption[]>();
  const order: string[] = [];
  const meta = new Map<string, { title: string; thumbnail: string }>();
  for (const m of matches) {
    const title = str(m.title);
    const url = str(m.link);
    if (!title || !url) continue;
    const key = normTitle(title);
    if (!key) continue;
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); meta.set(key, { title, thumbnail: str(m.thumbnail) }); }
    const opts = buckets.get(key)!;
    const retailer = str(m.source) || "Store";
    if (opts.some((o) => o.retailer.toLowerCase() === retailer.toLowerCase())) continue; // one per retailer
    opts.push({ retailer, price: fmtPrice(m.price), url, supported: isSupportedRetailerUrl(url) });
  }

  const results: ShoppingResult[] = order.map((key) => {
    const opts = buckets.get(key)!;
    const m = meta.get(key)!;
    // Prefer a renderable retailer as the primary; alternates are the others.
    const primary = opts.find((o) => o.supported) ?? opts[0];
    const alternates = opts.filter((o) => o !== primary);
    return {
      title: m.title,
      thumbnail: m.thumbnail,
      price: primary.price,
      retailer: primary.retailer,
      supported: primary.supported,
      // Keep the link even for a not-fetchable retailer — still a real buy URL for the shopper
      // (`supported` alone gates "Try on photo"/staging). See the google_shopping note above.
      productUrl: primary.url,
      immersiveToken: null,
      exact: true, score: null,
      alternates: alternates.length ? alternates : undefined,
    };
  });

  // Products with a renderable retailer first.
  results.sort((a, b) => Number(b.supported) - Number(a.supported));
  return results.slice(0, 6);
}

/** Resolve a Google Shopping immersive page token to a direct merchant URL via SerpApi. */
export async function resolveImmersiveToken(token: string, timeoutMs = 30_000): Promise<string | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return null;

  const qs = new URLSearchParams({
    engine: "google_immersive_product", page_token: token, api_key: apiKey, gl: "us", hl: "en",
  });
  try {
    const res = await fetch(`https://serpapi.com/search.json?${qs}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const data = await res.json() as { product_results?: { stores?: { name?: string; link?: string }[] } };
    const stores = data.product_results?.stores ?? [];
    // Prefer a store URL we can actually fetch.
    const supported = stores.find((s) => s.link && isSupportedRetailerUrl(s.link));
    return supported?.link ?? stores[0]?.link ?? null;
  } catch {
    return null;
  }
}

/**
 * Fill in a direct productUrl for supported-but-token-only results (Wayfair via Google
 * Shopping). NO LONGER called in the normal search flow — it spent one SerpApi call per
 * token-only candidate in the background, for candidates the user mostly never picks, so it
 * was removed to cut SerpApi usage. Resolution is now lazy: the product route resolves a token
 * only when that specific candidate is actually picked. Kept here for opt-in/eager use if a
 * future flow genuinely needs pre-resolved links, but wire it in deliberately, not by default.
 */
export async function resolveTokenUrls(results: ShoppingResult[]): Promise<ShoppingResult[]> {
  const targets = results.filter((r) => r.supported && !r.productUrl && r.immersiveToken);
  if (!targets.length) return results;
  await Promise.all(targets.map(async (r) => {
    const url = await resolveImmersiveToken(r.immersiveToken!, 10_000);
    if (url) r.productUrl = url;
  }));
  return results;
}
