// Google Gemini image model ("Nano Banana") — used for Room Restyle (AI virtual
// staging). Image-to-image: take a room photo + a theme/instruction and return a
// restyled room image. REST API via Google AI Studio; needs GEMINI_API_KEY.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// "Nano Banana" = Gemini 2.5 Flash Image — cheaper + available on the free tier.
// (Nano Banana Pro = "gemini-3-pro-image-preview" is higher quality but pricier.)
export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

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

/**
 * Build the prompt. First pass restyles to a theme while preserving architecture;
 * an `instruction` (with the latest result as the base image) does a targeted edit.
 */
export function buildRestylePrompt(theme: RestyleTheme, instruction?: string): string {
  if (instruction && instruction.trim()) {
    return (
      `Edit this room image: ${instruction.trim()}. ` +
      `Keep the room's architecture, layout, camera angle, lighting, and everything ` +
      `else identical — change only what the instruction asks. Photorealistic result.`
    );
  }
  return (
    `Restyle this room in a ${THEME_DESC[theme]} interior-design style. ` +
    `Keep the room's architecture, windows, doors, dimensions, and camera angle ` +
    `exactly the same — only change the furniture, decor, colors, and styling. ` +
    `Photorealistic, well-lit, realistic furniture and materials.`
  );
}

interface RestyleParams {
  /** Base image to transform (the room photo, or the latest result for edits). */
  imageBase64: string;
  mimeType: string;
  theme: RestyleTheme;
  instruction?: string;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
  }[];
}

/** Returns the restyled image as { base64, mimeType }. Throws on API/format error. */
export async function restyleRoom(
  params: RestyleParams
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const prompt = buildRestylePrompt(params.theme, params.instruction);

  const res = await fetch(
    `${GEMINI_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: params.mimeType, data: params.imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    throw new Error("Gemini returned no image");
  }
  return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType ?? "image/png" };
}
