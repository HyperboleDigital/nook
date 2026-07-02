import sharp from "sharp";
import { toUnsharedBuffer } from "@/lib/file-buf";

/**
 * Crop a buffer to a 0–1000-scaled box (ymin,xmin,ymax,xmax, same scale as Gemini's
 * detection boxes), with a small pad so the crop doesn't clip the item's edge.
 * Falls back to the original buffer if the box is degenerate or metadata can't be read.
 */
export async function cropToBox(buf: Buffer, box: [number, number, number, number], padPct = 0.04): Promise<Buffer> {
  const img = sharp(buf);
  const meta = await img.metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return buf;

  const [ymin, xmin, ymax, xmax] = box;
  const padX = (xmax - xmin) * padPct, padY = (ymax - ymin) * padPct;
  const left = Math.max(0, Math.round(((xmin - padX) / 1000) * w));
  const top = Math.max(0, Math.round(((ymin - padY) / 1000) * h));
  const right = Math.min(w, Math.round(((xmax + padX) / 1000) * w));
  const bottom = Math.min(h, Math.round(((ymax + padY) / 1000) * h));
  const cw = right - left, ch = bottom - top;
  if (cw < 20 || ch < 20) return buf; // degenerate box — keep original

  const out = await img.extract({ left, top, width: cw, height: ch }).toBuffer();
  return toUnsharedBuffer(out);
}
