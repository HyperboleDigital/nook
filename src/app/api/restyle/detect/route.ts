import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { detectObjects } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";

export const maxDuration = 60;

// POST /api/restyle/detect — detect editable objects in a room image for
// tap-to-select editing. JSON { imageUrl, restyleId? } or multipart `image`.
// When restyleId is given, the result is cached on the matching version row.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let base64: string;
    let mimeType: string;
    let imageUrl: string | null = null;
    let restyleId: string | null = null;

    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("application/json")) {
      const body = await req.json();
      imageUrl = body.imageUrl;
      restyleId = body.restyleId ?? null;
      if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
      const res = await fetch(imageUrl);
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      mimeType = res.headers.get("content-type") || "image/png";
    } else {
      const form = await req.formData();
      const file = form.get("image") as File | null;
      if (!file) return NextResponse.json({ error: "image required" }, { status: 400 });
      const _raw1 = new Uint8Array(await file.arrayBuffer());
      const _buf1 = Buffer.allocUnsafe(_raw1.byteLength); _buf1.set(_raw1);
      base64 = _buf1.toString("base64");
      mimeType = file.type || "image/jpeg";
    }

    const objects = await detectObjects({ imageBase64: base64, mimeType });

    // Persist on the project so the item list is stable across reloads (detection
    // is non-deterministic — without this the chips changed every load).
    if (restyleId) {
      await supabaseAdmin
        .from("restyles").update({ detected_objects: objects }).eq("id", restyleId).eq("user_id", userId);
    }

    return NextResponse.json({ objects });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Detect failed" }, { status: 500 });
  }
}
