/**
 * Downscale + re-encode an image File in the browser before it's uploaded.
 *
 * Phone photos and screenshots routinely exceed Vercel's 4.5 MB request-body
 * limit. When a multipart POST goes over that, Vercel drops the connection at
 * the edge and the browser surfaces it as a generic "load failed" / "Failed to
 * fetch" — not a real HTTP error, so it's easy to misread. Capping the longest
 * edge at ~1600px and re-encoding as JPEG keeps every product upload well under
 * the limit while staying sharp enough for Gemini identification + Lens matching.
 *
 * Browser-only (uses createImageBitmap/canvas) — call from client handlers only.
 */
export async function downscaleImage(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // decode failed (e.g. some HEIC) — let the server try the original

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) return file;
  // Already small and re-encoding didn't help — keep the original.
  if (blob.size >= file.size && file.size < 4_000_000) return file;

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
