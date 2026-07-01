import { put } from "@vercel/blob";
import sharp from "sharp";
import { composeEdits, type ComposeEditInput } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";
import { toUnsharedBuffer } from "@/lib/file-buf";

const SUPPORTED: [string, number][] = [
  ["1:1", 1], ["3:4", 0.75], ["4:3", 1.3333], ["2:3", 0.6667], ["3:2", 1.5],
  ["4:5", 0.8], ["5:4", 1.25], ["9:16", 0.5625], ["16:9", 1.7778],
];
export function closestAspect(w: number, h: number) {
  const r = w / h;
  return SUPPORTED.reduce((best, s) => (Math.abs(s[1] - r) < Math.abs(best[1] - r) ? s : best), SUPPORTED[0])[0];
}

export async function uploadImage(userId: string, buf: Buffer, contentType: string) {
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  // put() sends the body via fetch; sharp's output buffer can be SharedArrayBuffer-
  // backed on Vercel, which undici rejects. Copy into a plain-backed view first.
  const blob = await put(
    `restyle/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
    toUnsharedBuffer(buf), { access: "public", contentType }
  );
  return blob.url;
}

async function urlToBuf(url: string) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

async function urlToImage(url: string) {
  const res = await fetch(url);
  return {
    base64: Buffer.from(await res.arrayBuffer()).toString("base64"),
    mimeType: res.headers.get("content-type") || "image/png",
  };
}

interface RestyleRow {
  id: string;
  original_url: string;
  width: number | null;
  height: number | null;
}

/**
 * Render the project at its current set of ACTIVE edits and set it as current_url.
 * The render for each active-set combination is cached in restyle_renders, so
 * toggling back to a seen combination is instant and free.
 * Returns the image URL of the active render.
 */
export async function recompose(
  restyle: RestyleRow,
  userId: string
): Promise<string> {
  const { data: edits } = await supabaseAdmin
    .from("restyle_edits")
    .select("*")
    .eq("restyle_id", restyle.id)
    .eq("active", true)
    .order("position", { ascending: true });

  const active = edits ?? [];

  // No active edits → the original is the current view.
  if (active.length === 0) {
    await supabaseAdmin.from("restyles").update({ current_url: restyle.original_url, updated_at: new Date().toISOString() }).eq("id", restyle.id);
    return restyle.original_url;
  }

  const signature = active.map((e) => e.id).join(",");

  // Cache hit → reuse instantly.
  const { data: cached } = await supabaseAdmin
    .from("restyle_renders").select("image_url").eq("restyle_id", restyle.id).eq("signature", signature).maybeSingle();
  if (cached?.image_url) {
    await supabaseAdmin.from("restyles").update({ current_url: cached.image_url, updated_at: new Date().toISOString() }).eq("id", restyle.id);
    return cached.image_url;
  }

  // Build the combined render from the original.
  const baseBuf = await urlToBuf(restyle.original_url);
  const meta = await sharp(baseBuf).metadata();
  const canonW = restyle.width ?? meta.width;
  const canonH = restyle.height ?? meta.height;
  const aspectRatio = canonW && canonH ? closestAspect(canonW, canonH) : undefined;

  const composeInputs: ComposeEditInput[] = [];
  for (const e of active) {
    const reference = e.reference_url ? await urlToImage(e.reference_url) : undefined;
    composeInputs.push({ kind: e.kind, targetLabel: e.target_label, instruction: e.instruction, reference, referenceDesc: e.reference_desc });
  }

  const result = await composeEdits({
    imageBase64: baseBuf.toString("base64"),
    mimeType: "image/jpeg",
    edits: composeInputs,
    aspectRatio,
  });

  let outBuf = Buffer.from(result.base64, "base64");
  if (canonW && canonH) {
    outBuf = Buffer.from(await sharp(outBuf).resize(canonW, canonH, { fit: "cover" }).png().toBuffer());
  }
  const url = await uploadImage(userId, outBuf, "image/png");

  await supabaseAdmin.from("restyle_renders").insert({ restyle_id: restyle.id, signature, image_url: url });
  await supabaseAdmin.from("restyles").update({ current_url: url, updated_at: new Date().toISOString() }).eq("id", restyle.id);
  return url;
}
