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

export interface ShoppingResult {
  title: string;
  thumbnail: string;
  price: string | null;
  retailer: string;
  supported: boolean;
  productUrl: string | null;     // direct merchant URL (Amazon/Walmart/Home Depot)
  immersiveToken: string | null; // Google Shopping → resolve to a URL on pick (Wayfair today)
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
        retailer: "Amazon", supported: isSupportedRetailerUrl(url), productUrl: url, immersiveToken: null,
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
        retailer: "Walmart", supported: isSupportedRetailerUrl(url), productUrl: url, immersiveToken: null,
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
        retailer: "The Home Depot", supported: isSupportedRetailerUrl(url), productUrl: url, immersiveToken: null,
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
        productUrl: url && isSupportedRetailerUrl(url) ? url : null,
        immersiveToken: token,
      };
    },
  },
];

export async function searchShopping(query: string): Promise<ShoppingResult[]> {
  const settled = await Promise.all(
    ENGINES.map(async (e) => {
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

  // Interleave engines (take a few from each) so one retailer doesn't dominate the list,
  // then dedupe by normalised title and sort renderable candidates first.
  const seen = new Set<string>();
  const out: ShoppingResult[] = [];
  const perEngine = settled.map((arr) => arr.slice(0, 4));
  for (let i = 0; i < 4; i++) {
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
  return out.slice(0, 6);
}

/** Resolve a Google Shopping immersive page token to a direct merchant URL via SerpApi. */
export async function resolveImmersiveToken(token: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return null;

  const qs = new URLSearchParams({
    engine: "google_immersive_product", page_token: token, api_key: apiKey, gl: "us", hl: "en",
  });
  try {
    const res = await fetch(`https://serpapi.com/search.json?${qs}`, { signal: AbortSignal.timeout(30_000) });
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
