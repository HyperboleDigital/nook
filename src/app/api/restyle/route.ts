import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/restyle-render";
import { fileToBuffer } from "@/lib/file-buf";
import { detectObjects } from "@/lib/gemini";

// Cap the working resolution; every render is normalized to the canonical dims.
const MAX_DIM = 1536;

const ROOM_TYPES = ["living_room", "bedroom", "dining", "home_office", "multi_use", "other"] as const;

// Detection can take a few seconds on top of the create itself — give after() room
// under the route's own maxDuration (Vercel bounds after() work to it).
export const maxDuration = 60;

// POST /api/restyle — create a restyle project from a room photo. Detection runs
// in the background via after() using the canonical buffer already in memory, so
// chips are typically ready by the time the editor mounts instead of the client
// having to trigger + wait for a separate detect call after the page loads.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    if (!photo) return NextResponse.json({ error: "A room photo is required" }, { status: 400 });
    const title = (form.get("title") as string | null)?.trim() || "Untitled room";
    const roomTypeRaw = (form.get("room_type") as string | null)?.trim();
    const roomType = ROOM_TYPES.includes(roomTypeRaw as (typeof ROOM_TYPES)[number]) ? roomTypeRaw : null;

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
        ...(roomType ? { room_type: roomType } : {}),
      })
      .select().single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });

    // Fire-and-forget: detect objects from the buffer we already have in memory (no
    // refetch) and persist once done. Doesn't block the response.
    after(async () => {
      try {
        const objects = await detectObjects({ imageBase64: canonical.toString("base64"), mimeType: "image/jpeg" });
        await supabaseAdmin.from("restyles").update({ detected_objects: objects }).eq("id", created.id);
      } catch { /* the client falls back to POST /api/restyle/detect if this never lands */ }
    });

    return NextResponse.json({ restyleId: created.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 500 });
  }
}
