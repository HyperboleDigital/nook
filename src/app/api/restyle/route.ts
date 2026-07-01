import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/restyle-render";
import { fileToBuffer } from "@/lib/file-buf";

// Cap the working resolution; every render is normalized to the canonical dims.
const MAX_DIM = 1536;

// POST /api/restyle — create a restyle project from a room photo. No Gemini call:
// the project starts showing the original; changes are added as toggleable edits.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    if (!photo) return NextResponse.json({ error: "A room photo is required" }, { status: 400 });
    const title = (form.get("title") as string | null)?.trim() || "Untitled room";

    // Canonicalize the original: EXIF-rotate + downscale to MAX_DIM (keeps aspect).
    // Copy into a fresh (non-shared) buffer — a view over a SharedArrayBuffer is rejected downstream.
    const photoBuf = await fileToBuffer(photo);
    const canonical = await sharp(photoBuf)
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const meta = await sharp(canonical).metadata();
    const originalUrl = await uploadImage(userId, canonical, "image/jpeg");

    // Ensure the user row exists (FK), mirroring the tours route.
    const user = await currentUser();
    await supabaseAdmin.from("users").upsert(
      { clerk_id: userId, email: user?.emailAddresses?.[0]?.emailAddress ?? "", plan: "free", tours_used: 0, reels_used: 0 },
      { onConflict: "clerk_id", ignoreDuplicates: true }
    );

    const { data: created, error } = await supabaseAdmin
      .from("restyles")
      .insert({
        user_id: userId,
        title,
        original_url: originalUrl,
        current_url: originalUrl,
        width: meta.width ?? null,
        height: meta.height ?? null,
      })
      .select().single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });

    return NextResponse.json({ restyleId: created.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 500 });
  }
}
