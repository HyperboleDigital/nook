import { auth, currentUser } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { restyleRoom, type RestyleMode, type RestyleTheme } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";

// Cap the working resolution so the canonical original (and every result, which is
// normalized to its dimensions) stays a reasonable file size while keeping aspect.
const MAX_DIM = 1536;

async function fileToBuf(f: File) {
  return Buffer.from(await f.arrayBuffer());
}
async function urlToBuf(url: string) {
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}
async function uploadBuf(userId: string, buf: Buffer, contentType: string) {
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  const blob = await put(
    `restyle/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
    buf, { access: "public", contentType }
  );
  return blob.url;
}

function labelFor(mode: RestyleMode, o: { theme?: string; customStyle?: string; instruction?: string; targetLabel?: string }) {
  switch (mode) {
    case "theme": return o.theme ? o.theme[0].toUpperCase() + o.theme.slice(1) : "Restyle";
    case "custom": return o.customStyle?.slice(0, 40) || "Custom";
    case "remove-furniture": return "Removed furniture";
    case "edit": return `Edited ${o.targetLabel ?? "item"}`;
    default: return o.instruction?.slice(0, 40) || "Refined";
  }
}

// POST /api/restyle — generate or edit a restyle, persisting history.
// First call: canonicalize + store the original, create a project.
// Every generated image is resized to the source's EXACT dimensions so the
// before/after slider lines up pixel-for-pixel.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const mode = ((form.get("mode") as string) || "theme") as RestyleMode;
    const restyleId = (form.get("restyleId") as string) || null;
    const theme = (form.get("theme") as string) || undefined;
    const customStyle = (form.get("customStyle") as string) || undefined;
    const instruction = (form.get("instruction") as string) || undefined;
    const targetLabel = (form.get("targetLabel") as string) || undefined;
    const referenceFile = form.get("reference") as File | null;
    const photo = form.get("photo") as File | null;

    let srcBuf: Buffer;
    let srcMime: string;
    let originalUrl: string | null = null;

    if (restyleId) {
      const { data: row } = await supabaseAdmin
        .from("restyles").select("*").eq("id", restyleId).eq("user_id", userId).single();
      if (!row) return NextResponse.json({ error: "Restyle not found" }, { status: 404 });
      srcBuf = await urlToBuf(row.current_url);
      srcMime = "image/png";
    } else {
      if (!photo) return NextResponse.json({ error: "A room photo is required" }, { status: 400 });
      // Canonicalize the original: downscale to MAX_DIM (keeps aspect). Every
      // result is then matched to these dimensions.
      srcBuf = await sharp(await fileToBuf(photo))
        .rotate() // honor EXIF orientation
        .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      srcMime = "image/jpeg";
      originalUrl = await uploadBuf(userId, srcBuf, srcMime);
    }

    const meta = await sharp(srcBuf).metadata();

    // Persist the reference photo so history can show what was used.
    let referenceUrl: string | null = null;
    let reference: { base64: string; mimeType: string } | undefined;
    if (referenceFile) {
      const rbuf = await fileToBuf(referenceFile);
      const rmime = referenceFile.type || "image/jpeg";
      referenceUrl = await uploadBuf(userId, rbuf, rmime);
      reference = { base64: rbuf.toString("base64"), mimeType: rmime };
    }

    const result = await restyleRoom({
      imageBase64: srcBuf.toString("base64"),
      mimeType: srcMime,
      mode,
      theme: theme as RestyleTheme | undefined,
      customStyle, instruction, targetLabel, reference,
    });

    // Force the result to the source's exact dimensions → perfect slider overlay.
    let outBuf = Buffer.from(result.base64, "base64");
    if (meta.width && meta.height) {
      outBuf = Buffer.from(await sharp(outBuf).resize(meta.width, meta.height, { fit: "cover" }).png().toBuffer());
    }
    const resultUrl = await uploadBuf(userId, outBuf, "image/png");
    const label = labelFor(mode, { theme, customStyle, instruction, targetLabel });

    if (!restyleId) {
      const user = await currentUser();
      await supabaseAdmin.from("users").upsert(
        { clerk_id: userId, email: user?.emailAddresses?.[0]?.emailAddress ?? "", plan: "free", tours_used: 0, reels_used: 0 },
        { onConflict: "clerk_id", ignoreDuplicates: true }
      );
      const { data: created, error } = await supabaseAdmin
        .from("restyles")
        .insert({ user_id: userId, title: label, original_url: originalUrl!, current_url: resultUrl })
        .select().single();
      if (error || !created) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });
      await supabaseAdmin.from("restyle_versions").insert({ restyle_id: created.id, image_url: resultUrl, label, reference_url: referenceUrl });
      return NextResponse.json({ restyleId: created.id, url: resultUrl });
    }

    await supabaseAdmin.from("restyle_versions").insert({ restyle_id: restyleId, image_url: resultUrl, label, reference_url: referenceUrl });
    await supabaseAdmin.from("restyles").update({ current_url: resultUrl, updated_at: new Date().toISOString() }).eq("id", restyleId);
    return NextResponse.json({ restyleId, url: resultUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Restyle failed" }, { status: 500 });
  }
}
