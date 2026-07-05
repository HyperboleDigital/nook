// Google Gemini — used for Room Restyle (AI virtual staging).
// - Image generation/editing ("Nano Banana", gemini-2.5-flash-image): restyle/edit a room.
// - Vision (gemini-2.5-flash): detect objects in a room for tap-to-select editing.
// REST API via Google AI Studio; needs GEMINI_API_KEY.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// "Nano Banana" = Gemini 2.5 Flash Image — cheaper, used for theme/refine/etc.
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
// "Nano Banana Pro" — much stronger at reference-guided multi-image edits
// (swapping an item to match an uploaded reference photo).
export const GEMINI_IMAGE_PRO_MODEL = "gemini-3-pro-image-preview";
// Vision model for object detection/segmentation (returns JSON, ~0.1c/call).
export const GEMINI_VISION_MODEL = "gemini-2.5-flash";

export type RestyleTheme =
  | "modern"
  | "scandinavian"
  | "mid-century"
  | "industrial"
  | "coastal"
  | "japandi"
  | "minimalist"
  | "luxe";

const THEME_DESC: Record<RestyleTheme, string> = {
  modern: "modern contemporary",
  scandinavian: "Scandinavian (light woods, neutral tones, cozy minimalism)",
  "mid-century": "mid-century modern (warm woods, retro furniture, clean lines)",
  industrial: "industrial (exposed materials, metal, leather, moody tones)",
  coastal: "coastal (airy, light blues and whites, natural textures)",
  japandi: "Japandi (Japanese-Scandinavian, warm minimal, natural materials)",
  minimalist: "minimalist (uncluttered, neutral palette, clean simple forms)",
  luxe: "luxury (high-end finishes, rich materials, elegant statement pieces)",
};

export type RestyleMode = "theme" | "custom" | "remove-furniture" | "refine" | "edit";

const KEEP_ARCH =
  "Keep the room's architecture, windows, doors, dimensions, and camera angle exactly the same. " +
  "Photorealistic, well-lit, realistic materials.";

interface RestyleParams {
  /** Base image to transform (room photo, or the latest result for edits). */
  imageBase64: string;
  mimeType: string;
  mode: RestyleMode;
  theme?: RestyleTheme;
  customStyle?: string;
  instruction?: string;
  /** For mode "edit": the object label to change (from detectObjects). */
  targetLabel?: string;
  /** For mode "edit": optional reference image for the new item. */
  reference?: { base64: string; mimeType: string };
  /** Supported aspect ratio string (e.g. "4:3") to coax the output ratio. */
  aspectRatio?: string;
  /** Explicit model choice. If omitted, reference edits use Pro, else Flash. */
  model?: "flash" | "pro";
}

function buildPrompt(p: RestyleParams): string {
  switch (p.mode) {
    case "theme":
      return `Restyle this room in a ${THEME_DESC[p.theme ?? "modern"]} interior-design style. ` +
        `Only change furniture, decor, colors, and styling. ${KEEP_ARCH}`;
    case "custom":
      return `Restyle this room in this style: ${p.customStyle ?? ""}. ` +
        `Only change furniture, decor, colors, and styling. ${KEEP_ARCH}`;
    case "remove-furniture":
      return `Remove all furniture, decor, rugs, and clutter. Show a clean, empty room with bare ` +
        `floors and walls. ${KEEP_ARCH}`;
    case "edit": {
      const target = p.targetLabel ?? "selected item";
      if (p.reference) {
        let s =
          `You are compositing a product into a room photo. Replace the existing ${target} in the ` +
          `first image with the ${target} shown in the second image. Reproduce the second image's ` +
          `exact design, shape, color, and finish, and fit it to the room's perspective, scale, ` +
          `lighting, and shadows so it looks naturally installed in the same position.`;
        if (p.instruction?.trim()) s += ` Also apply this direction: ${p.instruction.trim()}.`;
        s += ` Keep everything else in the first image — layout, other furniture, walls, floor, ` +
          `lighting, and camera angle — completely identical.`;
        return s;
      }
      return `Change only the ${target} in this room: ${p.instruction ?? ""}. ` +
        `Keep everything else in the image identical.`;
    }
    case "refine":
    default:
      return `Edit this room image: ${p.instruction ?? ""}. Keep everything else identical. ` +
        `Photorealistic result.`;
  }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] };
  }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every Gemini call used to have no fetch timeout at all — bounded only by the route's
// maxDuration, so a single slow call could silently eat the whole budget. Vision calls
// (detect/describe/locate/score) get a tight budget since they're one small JSON response;
// image generation gets a much larger one since it's the actual long-pole render.
const VISION_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 90_000;

async function geminiPost(
  model: string,
  body: unknown,
  opts: { timeoutMs?: number; maxRetries?: number } = {},
  attempt = 0
): Promise<GeminiResponse> {
  // Default retry budget is capped at 1 (2 attempts total) — this default is what every
  // vision call (detect/describe/locate/score) uses since they don't override maxRetries.
  // Image-gen calls explicitly pass maxRetries: 0 (see imageOpts below).
  const { timeoutMs = VISION_TIMEOUT_MS, maxRetries = 1 } = opts;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // A timed-out/aborted request is transient just like a 503 — retry the same way.
    if (attempt < maxRetries) {
      await sleep(1200 * 2 ** attempt);
      return geminiPost(model, body, opts, attempt + 1);
    }
    throw err;
  }
  // 503 (overloaded) / 500 are transient — retry with exponential backoff.
  if ((res.status === 503 || res.status === 500) && attempt < maxRetries) {
    await sleep(1200 * 2 ** attempt);
    return geminiPost(model, body, opts, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }
  return (await res.json()) as GeminiResponse;
}

/** Restyle/edit a room. Returns the new image as { base64, mimeType }. */
export async function restyleRoom(
  params: RestyleParams
): Promise<{ base64: string; mimeType: string }> {
  const target = params.targetLabel ?? "item";
  // Interleave labeled text with images — models localize "the second image"
  // unreliably, so we explicitly say which is the room and which is the swap-in.
  const parts: Record<string, unknown>[] = params.reference
    ? [
        { text: buildPrompt(params) },
        { text: "First image — the room to edit:" },
        { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } },
        { text: `Second image — the ${target} to install:` },
        { inline_data: { mime_type: params.reference.mimeType, data: params.reference.base64 } },
      ]
    : [
        { text: buildPrompt(params) },
        { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } },
      ];

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      // Pro honors this (esp. important for multi-image edits, which otherwise
      // default to a 1:1 square). Flash ignores it but returns near-input anyway.
      ...(params.aspectRatio ? { imageConfig: { aspectRatio: params.aspectRatio } } : {}),
    },
  };

  // Explicit model choice wins; otherwise reference-guided swaps use Pro and the
  // rest uses Flash. If Pro isn't available on this tier, fall back to Flash.
  const preferred =
    params.model === "pro" ? GEMINI_IMAGE_PRO_MODEL
    : params.model === "flash" ? GEMINI_IMAGE_MODEL
    : params.reference ? GEMINI_IMAGE_PRO_MODEL
    : GEMINI_IMAGE_MODEL;
  // No internal retry here — a Pro→Flash model fallback is effectively one retry already,
  // and stacking geminiPost's own backoff on top of two 90s model attempts risks blowing
  // well past the route's maxDuration.
  const imageOpts = { timeoutMs: IMAGE_TIMEOUT_MS, maxRetries: 0 };
  let data: GeminiResponse;
  try {
    data = await geminiPost(preferred, body, imageOpts);
  } catch (err) {
    if (preferred !== GEMINI_IMAGE_MODEL) {
      data = await geminiPost(GEMINI_IMAGE_MODEL, body, imageOpts);
    } else {
      throw err;
    }
  }

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image");
  return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
}

// Run an image-gen request with model selection + Pro→Flash fallback.
async function generateImage(
  parts: Record<string, unknown>[],
  opts: { aspectRatio?: string; model?: "flash" | "pro"; preferPro?: boolean }
): Promise<{ base64: string; mimeType: string }> {
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      ...(opts.aspectRatio ? { imageConfig: { aspectRatio: opts.aspectRatio } } : {}),
    },
  };
  const preferred =
    opts.model === "pro" ? GEMINI_IMAGE_PRO_MODEL
    : opts.model === "flash" ? GEMINI_IMAGE_MODEL
    : opts.preferPro ? GEMINI_IMAGE_PRO_MODEL
    : GEMINI_IMAGE_MODEL;
  const imageOpts = { timeoutMs: IMAGE_TIMEOUT_MS, maxRetries: 0 };
  let data: GeminiResponse;
  try {
    data = await geminiPost(preferred, body, imageOpts);
  } catch (err) {
    if (preferred !== GEMINI_IMAGE_MODEL) data = await geminiPost(GEMINI_IMAGE_MODEL, body, imageOpts);
    else throw err;
  }
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image");
  return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
}

export interface ComposeEditInput {
  kind: RestyleMode | "item" | "style" | "remove" | "refine" | "add";
  targetLabel?: string | null;
  instruction?: string | null;
  reference?: { base64: string; mimeType: string };
  referenceDesc?: string | null;
  /** Already-derived placement language for an "add" edit (see src/lib/placement.ts) —
   *  wins over `instruction` in the "Place it …" slot. */
  placement?: string | null;
}

/**
 * Apply ALL given edits to the base room in one call — the "active layers" render.
 * References are appended as labeled images and cited by number in the prompt.
 */
export async function composeEdits(params: {
  imageBase64: string;
  mimeType: string;
  edits: ComposeEditInput[];
  aspectRatio?: string;
}): Promise<{ base64: string; mimeType: string }> {
  // Assign image numbers to references (image 1 = the base room).
  let imgNum = 2;
  const refNum = new Map<ComposeEditInput, number>();
  const refParts: Record<string, unknown>[] = [];
  for (const e of params.edits) {
    if (e.reference) {
      refNum.set(e, imgNum);
      refParts.push({ text: `Image ${imgNum} — reference for the ${e.targetLabel ?? "item"}:` });
      refParts.push({ inline_data: { mime_type: e.reference.mimeType, data: e.reference.base64 } });
      imgNum++;
    }
  }

  const lines = params.edits.map((e, i) => {
    const n = i + 1;
    const label = e.targetLabel ?? "item";
    const extra = e.instruction?.trim() ? ` Also: ${e.instruction.trim()}.` : "";
    switch (e.kind) {
      case "item": {
        if (!e.reference) return `${n}. Change the ${label}: ${e.instruction ?? ""}.`;
        const desc = e.referenceDesc?.trim() ? ` The reference ${label} is: ${e.referenceDesc.trim()}.` : "";
        return `${n}. Replace the ${label} in this room with the product shown in image ${refNum.get(e)}.${desc} Use the reference's real proportions — its width, height, and depth ratio — even if they are very different from the current ${label}; do not keep the old ${label}'s height or footprint, and do not just re-skin or recolor the existing one — build the new product from scratch. If real dimensions are given above, size it to those measurements, scaled accurately to the room using the ceiling height (~8–9 ft), doorways, and nearby furniture as references. You may adjust the immediate area so it looks natural and correctly proportioned: if the new ${label} is shorter or longer, reposition what sits on or near it (e.g. lower the TV, move décor) and fill in the wall or floor the old ${label} used to cover. Reproduce the reference's design, materials, color, and details accurately, and match the room's perspective, lighting, and shadows. Keep the rest of the room — walls, windows, flooring, and other furniture — consistent.${extra}`;
      }
      case "add": {
        // Derived pin language wins; a describe-flow add's free-text instruction is the fallback.
        const placementText = e.placement?.trim() ?? e.instruction?.trim() ?? "";
        const placement = placementText ? ` Place it ${placementText}.` : "";
        if (!e.reference)
          return `${n}. Add a ${label} to this room.${placement} Make it look naturally placed — match the room's perspective, scale, lighting, and shadows. Do not remove or change any existing furniture or decor.`;
        const desc = e.referenceDesc?.trim() ? ` The reference ${label} is: ${e.referenceDesc.trim()}.` : "";
        return `${n}. Add the ${label} shown in image ${refNum.get(e)} to this room.${placement}${desc} Reproduce the reference's exact design, materials, and finish, and build it at its REAL-WORLD proportions — its true width-to-height-to-depth ratio — even if that makes it lower and wider (or taller) than a typical ${label}. If real dimensions are given above, size the product to those measurements, scaled accurately to the room using the ceiling height (~8–9 ft), doorways, and nearby furniture as references. Match the room's perspective, lighting, and shadows. Do not remove or change any existing furniture or decor.`;
      }
      case "style":
        return `${n}. Restyle the whole room in this style: ${e.instruction ?? ""}.`;
      case "remove":
        if (e.targetLabel) return `${n}. Remove the ${label} from the room entirely. Realistically fill in the floor, wall, or surface it used to cover — match the surrounding material, lighting, and shadows. Do not add anything in its place and do not change any other furniture or decor.`;
        return `${n}. Remove all furniture, decor, rugs, and clutter — leave a clean empty room with bare floor and walls.`;
      default:
        return `${n}. ${e.instruction ?? ""}.`;
    }
  });

  const prompt =
    "Apply ALL of the following changes to the base room (image 1). Keep the room's architecture, " +
    "layout, windows, doors, perspective, and camera angle identical — only make these changes:\n" +
    lines.join("\n") +
    "\nWhen a change references another image, that image is the EXACT product to use — reproduce its " +
    "design, proportions, and details precisely rather than restyling the original item. " +
    "Return one photorealistic image with every change applied.";

  const parts: Record<string, unknown>[] = [
    { text: prompt },
    { text: "Image 1 — the base room:" },
    { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } },
    ...refParts,
  ];

  // Always use Pro for restyle renders (best fidelity, esp. reference replacement);
  // generateImage falls back to Flash only if Pro is unavailable.
  return generateImage(parts, { aspectRatio: params.aspectRatio, model: "pro", preferPro: true });
}

export interface DetectedObject {
  label: string;
  /** [ymin, xmin, ymax, xmax], scaled 0–1000 relative to the image. */
  box_2d: [number, number, number, number];
}

/** Detect editable elements in a room (furniture, decor, fixtures, walls, floor). */
export async function detectObjects(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<DetectedObject[]> {
  const prompt =
    "Detect the major design-relevant elements in this room — the walls (e.g. \"left wall\", " +
    "\"right wall\"), floor, ceiling, windows, doors, the ceiling fan and light fixtures, and any " +
    "furniture, rugs, mirrors, or curtains. " +
    "Do NOT include small utility fixtures: air vents, electrical outlets, light switches, " +
    "baseboards, door handles, thermostats, or smoke detectors. " +
    'Return a JSON array; each item has "label" (a short human name) and "box_2d" ' +
    "([ymin, xmin, ymax, xmax] as integers 0–1000). No duplicates, at most 14 items.";

  const data = await geminiPost(GEMINI_VISION_MODEL, {
    contents: [
      { parts: [{ text: prompt }, { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } }] },
    ],
    generationConfig: { responseMimeType: "application/json" },
  });

  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "[]";
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as DetectedObject[];
    return Array.isArray(parsed)
      ? parsed.filter((o) => o?.label && Array.isArray(o.box_2d) && o.box_2d.length === 4)
      : [];
  } catch {
    return [];
  }
}

/**
 * Item-aware description of a reference product, injected into the replacement
 * prompt so swaps reproduce its real proportions/details. Describes only what
 * defines THAT kind of item (a TV → screen/stand; a cabinet → doors; a lamp →
 * height/shade), always anchored on proportions.
 */
export async function describeProduct(params: {
  imageBase64: string;
  mimeType: string;
  label: string;
}): Promise<string> {
  const { label } = params;
  const prompt =
    `This is a ${label}. Describe it in one or two sentences for use in an image edit. ` +
    `Focus on its overall shape and PROPORTIONS (how low/tall and how wide — height relative to ` +
    `width), size, materials, color/finish, and the features that specifically define a ${label}. ` +
    `Describe only what's relevant to a ${label}; be concrete about proportions; no preamble.`;
  try {
    const data = await geminiPost(GEMINI_VISION_MODEL, {
      contents: [
        { parts: [{ text: prompt }, { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } }] },
      ],
    });
    return (data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "").trim();
  } catch {
    return ""; // description is best-effort; replacement still works without it
  }
}

/**
 * Find the bounding box of the primary product photo within a screenshot. Screenshots of
 * listing pages/apps carry a lot of UI chrome (nav bars, price, buttons, thumbnails strip)
 * that pollutes both Google Lens visual matching and the render reference — cropping to just
 * the product photo before using it anywhere noticeably improves match quality. Returns null
 * when nothing confident is found so the caller can fall back to the full image.
 */
export async function locateProductPhoto(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<[number, number, number, number] | null> {
  const prompt =
    "This is a screenshot of a product listing page or shopping app screen. Find the bounding " +
    "box of the main product photo only — the large hero image of the item itself. Exclude " +
    "navigation bars, back/share buttons, price text, badges, thumbnail strips, and any other UI chrome. " +
    'Reply as JSON: {"box_2d":[ymin,xmin,ymax,xmax]} as integers 0-1000 (relative to the full ' +
    'screenshot), or {"box_2d":null} if there is no clear product photo. JSON only, no preamble.';
  try {
    const data = await geminiPost(GEMINI_VISION_MODEL, {
      contents: [
        { parts: [{ text: prompt }, { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } }] },
      ],
      // Bounding-box detection should be as repeatable as possible run-to-run — this feeds
      // a crop that a mis-fire visibly wrecks, unlike free-text description where variance
      // is harmless.
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "{}";
    const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    const box = parsed.box_2d;
    if (!Array.isArray(box) || box.length !== 4 || !box.every((n: unknown) => typeof n === "number")) return null;
    const [ymin, xmin, ymax, xmax] = box as [number, number, number, number];
    // Reject implausible boxes outright — a bad detection (e.g. locking onto a thumbnail
    // strip or icon) is worse than skipping the crop and using the full screenshot.
    if (xmax <= xmin || ymax <= ymin) return null;
    const areaFrac = ((xmax - xmin) * (ymax - ymin)) / (1000 * 1000);
    if (areaFrac < 0.06) return null; // suspiciously tiny — likely mis-detected a UI element
    return [ymin, xmin, ymax, xmax];
  } catch {
    return null; // best-effort — caller falls back to the full screenshot
  }
}

export interface ScreenshotDescription {
  itemType: string;    // short category noun, e.g. "sofa", "floor lamp"
  description: string; // shopping-search-friendly phrase: color, material, style, proportions
  productTitle?: string; // literal title/brand text read off the screenshot, if legible
}

/**
 * Identify the furniture/decor item in a screenshot for use as a shopping search query.
 * Unlike the other describe* functions, errors are NOT swallowed — there's no fallback
 * if Gemini can't identify the item (no search query to run).
 *
 * Run this on the FULL, uncropped screenshot (not a product-photo crop) — retailer listing
 * screenshots usually carry the exact title/brand as legible text (e.g. "Ebern Designs
 * Wuppertal Tennis Court"), and a literal title searches far more precisely for niche or
 * branded items than a generic color/material description ever can.
 */
export async function describeScreenshotForSearch(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<ScreenshotDescription> {
  const prompt =
    "This is a screenshot of a piece of furniture or home decor, likely from a shopping app or " +
    "retailer website. Ignore any social-media captions, watermarks, or background room — focus on the item itself. " +
    "If the screenshot shows a literal product title, listing name, or brand as text anywhere " +
    "(e.g. a listing page header), read it exactly as written — this is the most valuable signal for finding the exact product. " +
    "Only fill in productTitle if you can actually read specific listing text (a real title, brand, or model name). " +
    "Do NOT invent or paraphrase one from the image alone (e.g. never write something generic like \"Wall Art\" or " +
    "\"Canvas Print\" as a title) — if no such text is legible, productTitle must be null. " +
    'Reply as JSON: {"itemType":"<short category noun, e.g. sofa, coffee table, floor lamp, area rug, tv stand>","description":"<one concise phrase for a shopping search: color, material, style, approximate size/proportions — written the way someone types into Google Shopping, no marketing language>","productTitle":"<the exact title/brand text visible on the screenshot, or null if none is legible>"}. ' +
    "JSON only, no preamble.";
  const data = await geminiPost(GEMINI_VISION_MODEL, {
    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } }] }],
    generationConfig: { responseMimeType: "application/json" },
  });
  const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "{}";
  const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  const itemType = String(parsed.itemType || "").trim();
  const description = String(parsed.description || "").trim();
  const productTitle = String(parsed.productTitle || "").trim() || undefined;
  if (!description) throw new Error("Gemini couldn't identify an item in that image");
  return { itemType: itemType || "item", description, productTitle };
}

/**
 * Read a product listing's gallery (which usually includes a dimensions diagram)
 * to recover the REAL size + proportions — retail APIs rarely return dimensions as
 * text, but the spec image carries them. The result is injected into the compose
 * prompt so the rendered product is scaled accurately (the whole selling point).
 */
export async function describeProductImages(params: {
  images: { base64: string; mimeType: string }[];
  label: string;
}): Promise<string> {
  if (!params.images.length) return "";
  const { label } = params;
  const prompt =
    `These are photos of a ${label} from a retail listing. One of them may be a dimensions diagram. ` +
    `1) If any image shows measurements, state the real dimensions as width × depth × height in inches. ` +
    `2) Describe its overall proportions — how low or tall it is relative to how wide (e.g. "low and wide, ` +
    `height about 40% of its width" or "tall and narrow"). ` +
    `3) Note materials, color/finish, and the features that define a ${label}. ` +
    `Reply in two or three concise sentences, leading with the dimensions if found. No preamble.`;
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const img of params.images) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  }
  try {
    const data = await geminiPost(GEMINI_VISION_MODEL, { contents: [{ parts }] });
    return (data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "").trim();
  } catch {
    return ""; // best-effort
  }
}

/**
 * Rate how well each candidate image matches a target product image, 0–10 (10 = clearly the
 * same product). Used to grade shopping matches honestly instead of trusting Google Lens's
 * "exact" label. Returns scores aligned to `candidates`; null where it couldn't judge.
 */
export async function scoreImageMatches(params: {
  target: { base64: string; mimeType: string };
  candidates: { base64: string; mimeType: string }[];
}): Promise<(number | null)[]> {
  if (!params.candidates.length) return [];
  const n = params.candidates.length;
  const prompt =
    "The FIRST image is a TARGET product a user wants to find. The next " + n + " images are " +
    "candidate products, in order. For EACH candidate, rate how good a visual match it is to the " +
    "target as a furniture/decor substitute. Be generous about close matches: " +
    "10 = clearly the same product; 8–9 = same style with very similar shape, material and color; " +
    "6–7 = clearly the same look/style and would pass as a substitute; 4–5 = loosely similar; " +
    "0–3 = different category or look. If it reads as a good stand-in for the target, score 7+. " +
    "Judge the product itself, ignoring backgrounds, watermarks and angle. " +
    `Reply as JSON {"scores":[...]} with exactly ${n} integers (0–10) in the same order. JSON only.`;
  const parts: Record<string, unknown>[] = [
    { text: prompt },
    { inline_data: { mime_type: params.target.mimeType, data: params.target.base64 } },
  ];
  for (const c of params.candidates) parts.push({ inline_data: { mime_type: c.mimeType, data: c.base64 } });
  try {
    const data = await geminiPost(GEMINI_VISION_MODEL, {
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const text = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text ?? "{}";
    const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
    const scores: unknown[] = Array.isArray(parsed.scores) ? parsed.scores : [];
    return params.candidates.map((_, i) => {
      const v = Number(scores[i]);
      return Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : null;
    });
  } catch {
    return params.candidates.map(() => null);
  }
}
