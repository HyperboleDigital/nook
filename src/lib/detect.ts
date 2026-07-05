import { detectObjectsGemini } from "@/lib/gemini";
import { detectObjectsOpenAI } from "@/lib/openai";
import type { DetectedObject } from "@/types";

export type DetectProvider = "gemini" | "openai";

/** The provider used when a caller doesn't force one. `DETECTION_PROVIDER=openai` switches the
 *  default (only honored if `OPENAI_API_KEY` is actually set, so a misconfig can't silently
 *  break detection); otherwise Gemini. This is the knob for the A/B — flip the env var, or pass
 *  an explicit `provider` to `detectObjects` (the detect route accepts `?provider=` for a
 *  same-image comparison without redeploying). */
export function defaultDetectProvider(): DetectProvider {
  return process.env.DETECTION_PROVIDER === "openai" && process.env.OPENAI_API_KEY ? "openai" : "gemini";
}

const run = (p: DetectProvider, params: { imageBase64: string; mimeType: string }) =>
  p === "openai" ? detectObjectsOpenAI(params) : detectObjectsGemini(params);

/**
 * Detect room furniture/decor, dispatching to the chosen (or default) provider. Both providers
 * return the SAME shape (DETECT_PROMPT, 0–1000 box_2d), so nothing downstream cares which ran.
 * Robust: if the chosen provider throws or returns nothing, it falls back to the other one, so
 * an OpenAI outage/misconfig degrades to Gemini rather than leaving a room with no hotspots.
 */
export async function detectObjects(
  params: { imageBase64: string; mimeType: string },
  provider?: DetectProvider,
): Promise<DetectedObject[]> {
  const primary = provider ?? defaultDetectProvider();
  const fallback: DetectProvider = primary === "openai" ? "gemini" : "openai";
  try {
    const objs = await run(primary, params);
    if (objs.length) return objs;
  } catch (err) {
    console.error(`[detect] ${primary} failed, falling back to ${fallback}:`, err);
  }
  try {
    return await run(fallback, params);
  } catch (err) {
    console.error(`[detect] ${fallback} fallback also failed:`, err);
    return [];
  }
}
