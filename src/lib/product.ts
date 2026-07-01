/**
 * Product-link ingestion for "shop the look".
 *
 * `fetchProduct(url)` turns a retailer product URL into structured `ProductInfo`
 * that the restyle pipeline can render and link a Buy button to.
 *
 * Implemented against a paid product-data API because retailers like Wayfair sit
 * behind bot protection (PerimeterX/Akamai) that blocks a naive server-side fetch.
 * The provider is isolated behind this one module — swap `callProvider` to change
 * vendors without touching the rest of the app.
 *
 * Default adapter: Unwrangle (https://docs.unwrangle.com) — URL-based product detail.
 * Configure with PRODUCT_API_KEY (and optionally PRODUCT_API_PROVIDER later).
 */

export interface ProductInfo {
  title: string;          // listing title
  itemType: string;       // short category noun for the prompt + replace-matching, e.g. "sofa"
  description: string;    // materials / style blurb from the listing
  dimensions?: string;    // "84W x 38D x 34H in" — improves render scale accuracy
  price?: string;         // "$899.00" — shown on the Buy button
  imageUrl: string;       // primary product image (remote URL)
  images: string[];       // product image gallery — often includes a dimensions diagram
  retailer: string;       // "Wayfair" — Buy button label
  buyUrl: string;         // canonical product URL
}

export class ProductFetchError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "ProductFetchError";
  }
}

export const RETAILERS: Record<string, { platform: string; name: string }> = {
  "wayfair.com": { platform: "wayfair_detail", name: "Wayfair" },
  "amazon.com": { platform: "amazon_detail", name: "Amazon" },
  "walmart.com": { platform: "walmart_detail", name: "Walmart" },
  // SerpApi's Home Depot results carry apionline.homedepot.com URLs, which match
  // `.homedepot.com` here and are what Unwrangle's homedepot_detail expects.
  "homedepot.com": { platform: "homedepot_detail", name: "The Home Depot" },
};

export function isSupportedRetailerUrl(rawUrl: string): boolean {
  try { return retailerFor(new URL(rawUrl)) !== null; } catch { return false; }
}

function retailerFor(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  const key = Object.keys(RETAILERS).find((d) => host === d || host.endsWith(`.${d}`));
  return key ? { domain: key, ...RETAILERS[key] } : null;
}

/** Leaf category name. Unwrangle returns categories as {name,url} objects (or strings). */
function leafCategory(categories: unknown): string {
  if (!Array.isArray(categories) || !categories.length) return "";
  const last = categories[categories.length - 1];
  if (typeof last === "string") return last;
  if (last && typeof last === "object" && "name" in last) return String((last as { name?: unknown }).name || "");
  return "";
}

/** Derive a short prompt-friendly noun from the title + leaf category. */
function categoryToItemType(categories: unknown, title: string): string {
  return keywordType(`${title} ${leafCategory(categories)}`);
}

/** Keyword-match text to a known furniture type (also used for replace-matching). */
function keywordType(text: string): string {
  const l = text.toLowerCase();
  const map: [RegExp, string][] = [
    [/sectional|sofa|couch|loveseat/, "sofa"],
    [/dining table/, "dining table"],
    [/dining chair/, "dining chair"],
    [/coffee table/, "coffee table"],
    [/side table|end table|nightstand/, "side table"],
    [/armchair|accent chair|recliner|chair/, "chair"],
    [/tv stand|media console|media storage|entertainment center/, "tv stand"],
    [/\btv\b|television/, "tv"],
    [/floor lamp|table lamp|\blamp\b/, "lamp"],
    [/chandelier|pendant|ceiling fan|light fixture/, "light fixture"],
    [/\brug\b|carpet/, "rug"],
    [/curtain|drape/, "curtains"],
    [/headboard|\bbed\b/, "bed"],
    [/bookshelf|bookcase|shelf|shelving/, "shelving"],
    [/cabinet|sideboard|dresser|console/, "cabinet"],
    [/\bdesk\b/, "desk"],
    [/ottoman|pouf/, "ottoman"],
    [/plant|planter/, "plant"],
    [/mirror/, "mirror"],
    [/wall art|painting|print|poster/, "wall art"],
  ];
  for (const [re, type] of map) if (re.test(l)) return type;
  return "item";
}

function cleanText(s: unknown): string {
  return String(s ?? "").replace(/[【】\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build the descriptive blurb. The bullet lists hold the real product detail
 * (materials, finish, design); `description` is usually marketing boilerplate, so
 * it's only a fallback. Field names vary by retailer: Wayfair/Home Depot use
 * `features`, Walmart uses `key_features`, Home Depot also exposes `highlights`.
 */
function buildDescription(detail: Record<string, unknown>): string {
  const bullets: string[] = [];
  for (const key of ["highlights", "features", "key_features"]) {
    const v = detail[key];
    if (Array.isArray(v)) bullets.push(...v.map(cleanText));
  }
  const joined = bullets.filter(Boolean).join(" ");
  if (joined) return joined.slice(0, 600);
  return cleanText(detail.description).slice(0, 600);
}

/** Flatten a dimensions field that may be a string, a {label,value} row, or an array of them. */
function dimsToString(v: unknown): string {
  if (typeof v === "string") return cleanText(v);
  if (Array.isArray(v)) return v.map(dimsToString).filter(Boolean).join("; ");
  if (v && typeof v === "object") {
    const o = v as { label?: unknown; name?: unknown; value?: unknown };
    const label = cleanText(o.label ?? o.name);
    const value = cleanText(o.value);
    return [label, value].filter(Boolean).join(": ");
  }
  return "";
}

/** Pull a dimensions string out of the listing's text fields, if present. */
function extractDimensions(detail: Record<string, unknown>): string | undefined {
  // Home Depot returns dimensions as a dedicated field ({label,value}) — prefer it.
  const direct = dimsToString(detail.dimensions);
  if (direct.trim()) return direct.slice(0, 120);

  const pools: string[] = [];
  for (const key of ["at_a_glance", "features", "key_features", "highlights", "product_overview", "specifications"]) {
    const v = detail[key];
    if (Array.isArray(v)) pools.push(...v.map(cleanText));
    else if (typeof v === "string") pools.push(cleanText(v));
  }
  const dimRe = /(\d+(\.\d+)?)\s*''?\s*[WwHhDd]\b|overall.*dimensions|dimensions?:/i;
  const hit = pools.find((s) => dimRe.test(s));
  return hit ? hit.slice(0, 120) : undefined;
}

/** Hosts that share/copy as short links (Amazon app → a.co, amzn.to). */
const SHORTENERS = /^(a\.co|amzn\.to|amzn\.com)$/i;

/** Follow redirects on a short link to recover the real product URL (header-only, cheap). */
async function expandShortLink(rawUrl: string): Promise<string> {
  let url = rawUrl;
  for (let i = 0; i < 5; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET", redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch { break; }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString();
    } else break;
  }
  return url;
}

async function callUnwrangle(platform: string, url: string, apiKey: string) {
  const endpoint =
    `https://data.unwrangle.com/api/getter/?platform=${platform}` +
    `&url=${encodeURIComponent(url)}&api_key=${apiKey}`;
  let res: Response;
  try {
    // Amazon scrapes are slow (often 45–80s) — give the provider room before aborting.
    res = await fetch(endpoint, { signal: AbortSignal.timeout(90_000) });
  } catch {
    throw new ProductFetchError("Couldn't reach the product service. Try again.", 502);
  }
  if (!res.ok) {
    throw new ProductFetchError(`Product lookup failed (${res.status}).`, 502);
  }
  const data = (await res.json()) as { success?: boolean; detail?: Record<string, unknown>; message?: string; error?: string };
  if (!data.success || !data.detail) {
    const reason = data.message || data.error || "";
    if (/not found/i.test(reason)) {
      throw new ProductFetchError("That looks like a category or search page — paste a specific product page link instead.", 422);
    }
    throw new ProductFetchError(reason || "No product found at that link.", 422);
  }
  return data.detail;
}

export async function fetchProduct(rawUrl: string): Promise<ProductInfo> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ProductFetchError("That doesn't look like a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ProductFetchError("That doesn't look like a valid link.");
  }

  // Amazon's app shares short a.co / amzn.to links — expand to the real product URL first.
  if (SHORTENERS.test(url.hostname.replace(/^www\./, ""))) {
    try { url = new URL(await expandShortLink(url.toString())); } catch { /* keep original */ }
  }

  const retailer = retailerFor(url);
  if (!retailer) {
    throw new ProductFetchError(
      `We don't support that retailer yet — try a Wayfair, Amazon, Walmart, or Home Depot product link.`,
      422
    );
  }

  // Strip query params and hash to a clean product URL.
  const cleanUrl = `${url.origin}${url.pathname}`;

  // Amazon goes through Rainforest (seconds, not Unwrangle's 60–90s); everyone else Unwrangle.
  if (retailer.domain === "amazon.com") {
    return fetchAmazonRainforest(url, cleanUrl);
  }

  const apiKey = process.env.PRODUCT_API_KEY;
  if (!apiKey) {
    throw new ProductFetchError("Product lookups aren't configured yet.", 500);
  }
  const detail = await callUnwrangle(retailer.platform, cleanUrl, apiKey);
  return mapUnwrangle(detail, retailer.name, cleanUrl);
}

/** Map an Unwrangle `detail` object into ProductInfo. */
function mapUnwrangle(detail: Record<string, unknown>, retailerName: string, cleanUrl: string): ProductInfo {
  const title = String(detail.name || "").trim();
  const gallery = Array.isArray(detail.images) ? detail.images.map(String).filter(Boolean) : [];
  const imageUrl = String(detail.main_image || gallery[0] || "");
  if (!title || !imageUrl) {
    throw new ProductFetchError("Couldn't read that product's details.", 422);
  }

  const priceNum = typeof detail.price === "number" ? detail.price : undefined;
  const currency = String(detail.currency || "USD");
  const price = priceNum != null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceNum)
    : undefined;

  return {
    title,
    itemType: categoryToItemType(detail.categories, title),
    description: buildDescription(detail),
    dimensions: extractDimensions(detail),
    price,
    imageUrl,
    images: gallery,
    retailer: retailerName,
    buyUrl: cleanUrl,
  };
}

/** Pull the 10-char ASIN out of an Amazon product URL. */
function amazonAsin(u: URL): string | null {
  const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|product)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Amazon product detail via Rainforest API (fast, Amazon-specialist). Prefers the ASIN
 * (`amazon_domain` + `asin`); `url` alone is the fallback (can't combine the two).
 */
async function fetchAmazonRainforest(url: URL, cleanUrl: string): Promise<ProductInfo> {
  const apiKey = process.env.RAINFOREST_API_KEY;
  if (!apiKey) throw new ProductFetchError("Amazon lookups aren't configured yet.", 500);

  const asin = amazonAsin(url);
  const qs = new URLSearchParams({ api_key: apiKey, type: "product" });
  if (asin) { qs.set("amazon_domain", "amazon.com"); qs.set("asin", asin); }
  else { qs.set("url", cleanUrl); }

  let res: Response;
  try {
    res = await fetch(`https://api.rainforestapi.com/request?${qs}`, { signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new ProductFetchError("Couldn't reach the product service. Try again.", 502);
  }
  if (!res.ok) throw new ProductFetchError(`Product lookup failed (${res.status}).`, 502);

  const data = (await res.json()) as { request_info?: { success?: boolean }; product?: Record<string, unknown> };
  const p = data.product;
  if (!data.request_info?.success || !p) {
    throw new ProductFetchError("Couldn't find that Amazon product — paste a specific product page link.", 422);
  }

  const title = String(p.title || "").trim();
  const mainImage = (p.main_image as { link?: string } | undefined)?.link ?? "";
  const gallery = Array.isArray(p.images)
    ? (p.images as { link?: string }[]).map((i) => String(i?.link || "")).filter(Boolean)
    : [];
  const imageUrl = String(mainImage || gallery[0] || "");
  if (!title || !imageUrl) {
    throw new ProductFetchError("Couldn't read that product's details.", 422);
  }

  const priceObj = (p.buybox_winner as { price?: { raw?: string; value?: number; currency?: string } } | undefined)?.price;
  const price = priceObj?.raw
    ?? (typeof priceObj?.value === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: priceObj.currency || "USD" }).format(priceObj.value)
      : undefined);

  return {
    title,
    itemType: categoryToItemType(p.categories, title),
    description: buildDescription({ features: p.feature_bullets }),
    dimensions: extractDimensions({ dimensions: p.dimensions, specifications: p.specifications }),
    price,
    imageUrl,
    images: gallery,
    retailer: "Amazon",
    buyUrl: String(p.link || cleanUrl),
  };
}
