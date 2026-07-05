import { DETECT_PROMPT } from "@/lib/gemini";
import type { DetectedObject } from "@/types";

// Direct REST calls (no `openai` npm dependency) — one vendor, one function, easy to reason
// about alongside the Gemini path. Vision model is overridable so a cheaper/newer model can be
// A/B'd without a code change.
const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o";

type RawObj = { label?: unknown; box_2d?: unknown };

/** Clamp + validate one raw object into a DetectedObject, or null if it's malformed. */
function normalize(o: RawObj): DetectedObject | null {
  if (!o || typeof o.label !== "string" || !o.label.trim()) return null;
  if (!Array.isArray(o.box_2d) || o.box_2d.length !== 4) return null;
  const nums = o.box_2d.map((n) => (typeof n === "number" ? n : Number(n)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  const [ymin, xmin, ymax, xmax] = nums.map(clamp);
  if (xmax <= xmin || ymax <= ymin) return null;
  return { label: o.label.trim(), box_2d: [ymin, xmin, ymax, xmax] };
}

/**
 * Detect room furniture/decor via OpenAI vision — same DETECT_PROMPT and same 0–1000
 * [ymin,xmin,ymax,xmax] `box_2d` output shape as the Gemini path, so everything downstream
 * (hotspots, cropping, the item list) is identical regardless of which provider ran. Throws if
 * `OPENAI_API_KEY` is missing or the call fails, so the dispatcher can fall back to Gemini.
 */
export async function detectObjectsOpenAI(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<DetectedObject[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const prompt =
    DETECT_PROMPT +
    ' Respond with a JSON object of the exact form {"objects": [{"label": string, "box_2d": [ymin, xmin, ymax, xmax]}]}. ' +
    "box_2d integers are 0–1000 normalized to the image (NOT pixels). No prose, JSON only.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${params.mimeType};base64,${params.imageBase64}`, detail: "high" } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`OpenAI detect failed (${res.status})`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text) as unknown;
  const arr: RawObj[] = Array.isArray(parsed)
    ? (parsed as RawObj[])
    : (((parsed as { objects?: RawObj[]; items?: RawObj[] })?.objects ?? (parsed as { items?: RawObj[] })?.items) ?? []);
  return arr.map(normalize).filter((o): o is DetectedObject => o !== null).slice(0, 14);
}
