/**
 * SerpApi Google Shopping — visual search candidate resolution.
 *
 * `searchShopping(query)` fires two parallel queries:
 *   1. Generic (multi-retailer) — for inspiration cards
 *   2. Wayfair-biased — ensures actionable results exist
 *
 * Returns up to 5 candidates. Supported retailers (currently only Wayfair,
 * via isSupportedRetailerUrl) get `supported: true` and an
 * `immersiveToken` that the product route can resolve to a direct URL.
 *
 * Vendor is isolated here; swap `callSerpApi` to change providers without
 * touching the rest of the app. Env var: SERPAPI_API_KEY.
 */

import { isSupportedRetailerUrl } from "@/lib/product";

export interface ShoppingResult {
  title: string;
  thumbnail: string;
  price: string | null;
  retailer: string;
  supported: boolean;
  immersiveToken: string | null; // passed to /api/restyle/[id]/product as `token`
}

export class ShoppingSearchError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "ShoppingSearchError";
  }
}

interface RawResult {
  title?: string;
  thumbnail?: string;
  price?: string;
  source?: string;
  immersive_product_page_token?: string;
  product_link?: string;
}

async function callSerpApi(q: string): Promise<RawResult[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new ShoppingSearchError("Shopping search isn't configured yet.", 500);

  const url =
    `https://serpapi.com/search.json?engine=google_shopping` +
    `&q=${encodeURIComponent(q)}&api_key=${apiKey}&num=10&gl=us&hl=en`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ShoppingSearchError("Couldn't reach the search service. Try again.", 502);
  }
  if (!res.ok) throw new ShoppingSearchError(`Search failed (${res.status}).`, 502);
  const data = await res.json() as { shopping_results?: RawResult[]; error?: string };
  if (data.error) throw new ShoppingSearchError(`Search error: ${data.error}`, 502);
  return data.shopping_results ?? [];
}

function toResult(r: RawResult, supported: boolean): ShoppingResult {
  return {
    title: r.title ?? "",
    thumbnail: r.thumbnail ?? "",
    price: r.price ?? null,
    retailer: r.source ?? "",
    supported,
    immersiveToken: r.immersive_product_page_token ?? null,
  };
}

export async function searchShopping(query: string): Promise<ShoppingResult[]> {
  // Two parallel queries: generic for variety, wayfair-biased for actionable results.
  const [generic, wayfair] = await Promise.all([
    callSerpApi(query).catch(() => [] as RawResult[]),
    callSerpApi(`${query} wayfair`).catch(() => [] as RawResult[]),
  ]);

  // Deduplicate by normalised title.
  const seen = new Set<string>();
  const out: ShoppingResult[] = [];

  const add = (r: RawResult, supported: boolean) => {
    const key = (r.title ?? "").toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(toResult(r, supported));
  };

  // Wayfair results first (they're all actionable).
  for (const r of wayfair.slice(0, 4)) add(r, true);

  // Non-Wayfair results from generic search (inspiration only).
  for (const r of generic) {
    if ((r.source ?? "").toLowerCase() === "wayfair") continue; // already from wayfair search
    const link = r.product_link ?? "";
    const sup = link ? isSupportedRetailerUrl(link) : false;
    add(r, sup);
    if (out.length >= 7) break;
  }

  return out.slice(0, 5);
}

/** Resolve an immersive page token to a direct merchant URL via SerpApi. */
export async function resolveImmersiveToken(token: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return null;

  const url =
    `https://serpapi.com/search.json?engine=google_immersive_product` +
    `&page_token=${encodeURIComponent(token)}&api_key=${apiKey}&gl=us&hl=en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const data = await res.json() as { product_results?: { stores?: { name?: string; link?: string }[] } };
    const stores = data.product_results?.stores ?? [];
    return stores[0]?.link ?? null;
  } catch {
    return null;
  }
}
