import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import { del } from "@vercel/blob";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage, urlToBuf } from "@/lib/restyle-render";
import { detectObjects } from "@/lib/detect";

// Cap the working resolution; every render is normalized to the canonical dims.
const MAX_DIM = 1536;

const ROOM_TYPES = ["living_room", "bedroom", "dining", "home_office", "multi_use", "other"] as const;

// Detection can take a few seconds on top of the create itself — give after() room
// under the route's own maxDuration (Vercel bounds after() work to it).
export const maxDuration = 60;

// POST /api/restyle — create a restyle project from a room photo already uploaded to Vercel
// Blob by the client (see /api/restyle/upload-url). The client only sends the resulting blob
// URL here, not the photo bytes — a closed tab can only interrupt the (separate, resumable)
// direct-to-Blob transfer, never this small JSON call, so a project either gets created
// cleanly or not at all; there's no half-created state to strand.
// Detection runs in the background via after() using the canonical buffer already in memory,
// so chips are typically ready by the time the editor mounts instead of the client having to
// trigger + wait for a separate detect call after the page loads.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl : null;
    if (!photoUrl) return NextResponse.json({ error: "A room photo is required" }, { status: 400 });
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Untitled room";
    const roomTypeRaw = typeof body.room_type === "string" ? body.room_type.trim() : "";
    const roomType = ROOM_TYPES.includes(roomTypeRaw as (typeof ROOM_TYPES)[number]) ? roomTypeRaw : null;

    // Canonicalize the original: EXIF-rotate + downscale to MAX_DIM (keeps aspect).
    const photoBuf = await urlToBuf(photoUrl);
    const canonical = await sharp(photoBuf)
      .rotate()
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const meta = await sharp(canonical).metadata();
    const originalUrl = await uploadImage(userId, canonical, "image/jpeg");

    // The client's raw upload is now redundant — the canonical copy above is what the app
    // actually uses. Best-effort cleanup; never let it fail project creation.
    try { await del(photoUrl); } catch { /* orphaned blob, harmless */ }

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
