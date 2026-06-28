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

async function geminiPost(model: string, body: unknown, attempt = 0): Promise<GeminiResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // 503 (overloaded) / 500 are transient — retry with exponential backoff.
  if ((res.status === 503 || res.status === 500) && attempt < 3) {
    await sleep(1200 * 2 ** attempt);
    return geminiPost(model, body, attempt + 1);
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
  let data: GeminiResponse;
  try {
    data = await geminiPost(preferred, body);
  } catch (err) {
    if (preferred !== GEMINI_IMAGE_MODEL) {
      data = await geminiPost(GEMINI_IMAGE_MODEL, body);
    } else {
      throw err;
    }
  }

  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image");
  return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
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
