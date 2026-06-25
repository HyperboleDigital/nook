// Luma AI Agents API — used for Reels video generation (ray-3.2 model)
// Docs: https://docs.agents.lumalabs.ai
// The old 3D capture API (webapp.engineeringlumalabs.com) is deprecated.
// 3D reconstruction is handled by the Modal + Nerfstudio pipeline (modal/worker.py).

const LUMA_BASE = "https://agents.lumalabs.ai/v1";

async function lumaFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${LUMA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Luma API error ${res.status}: ${text}`);
  }
  return res.json();
}

export type LumaAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";

/** Generate a cinematic video from a property image using Luma ray-3.2. */
export async function createReelVideo(params: {
  prompt: string;
  sourceImageUrl?: string;
  aspectRatio?: LumaAspectRatio;
}) {
  return lumaFetch("/generations", {
    method: "POST",
    body: JSON.stringify({
      prompt: params.prompt,
      type: "video",
      model: "ray-3.2",
      aspect_ratio: params.aspectRatio ?? "9:16",
      ...(params.sourceImageUrl
        ? { source: { type: "image", url: params.sourceImageUrl } }
        : {}),
    }),
  });
}

export async function getGeneration(id: string) {
  return lumaFetch(`/generations/${id}`);
}
