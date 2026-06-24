const HIGGSFIELD_BASE = "https://api.higgsfield.ai/v1";

async function higgsfetch(path: string, init?: RequestInit) {
  const res = await fetch(`${HIGGSFIELD_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Higgsfield API error ${res.status}: ${text}`);
  }
  return res.json();
}

export type ReelStyle = "cinematic" | "luxury" | "modern" | "warm";
export type ReelModel = "kling-3.0" | "veo-3.1";

export async function createGeneration(params: {
  prompt: string;
  referenceImageUrls: string[];
  style: ReelStyle;
  model: ReelModel;
}) {
  return higgsfetch("/generations", {
    method: "POST",
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      reference_images: params.referenceImageUrls.map((url) => ({ url })),
      aspect_ratio: "9:16",
      style_preset: params.style,
    }),
  });
}

export async function getGeneration(id: string) {
  return higgsfetch(`/generations/${id}`);
}

export function buildReelPrompt(style: ReelStyle, address?: string): string {
  const base: Record<ReelStyle, string> = {
    cinematic: "Cinematic drone flythrough of a stunning real estate property, smooth camera movements, golden hour lighting, professional real estate video",
    luxury: "Luxury real estate showcase, elegant interior reveals, premium lifestyle, architectural beauty, high-end cinematic quality",
    modern: "Modern minimalist real estate tour, clean lines, contemporary design, bright natural light, sleek transitions",
    warm: "Warm and inviting home tour, cozy atmosphere, natural light, welcoming spaces, lifestyle-focused real estate video",
  };
  const prompt = address ? `${base[style]}. Property: ${address}` : base[style];
  return prompt;
}
