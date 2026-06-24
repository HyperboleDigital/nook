const LUMA_BASE = "https://webapp.engineeringlumalabs.com/api/v2";

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

export async function createCapture(title: string) {
  return lumaFetch("/capture", {
    method: "POST",
    body: JSON.stringify({ title, privacy: "private" }),
  });
}

export async function getCapture(slug: string) {
  return lumaFetch(`/capture/${slug}`);
}

export async function uploadVideoToLuma(uploadUrl: string, videoBuffer: ArrayBuffer, contentType: string) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: videoBuffer,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}
