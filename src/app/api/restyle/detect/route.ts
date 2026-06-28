import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { detectObjects } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";

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
      base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      mimeType = file.type || "image/jpeg";
    }

    const objects = await detectObjects({ imageBase64: base64, mimeType });

    // Cache on the version row so we never re-detect this image (saves tokens).
    if (restyleId && imageUrl) {
      const { data: owned } = await supabaseAdmin
        .from("restyles").select("id").eq("id", restyleId).eq("user_id", userId).single();
      if (owned) {
        await supabaseAdmin
          .from("restyle_versions").update({ objects }).eq("restyle_id", restyleId).eq("image_url", imageUrl);
      }
    }

    return NextResponse.json({ objects });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Detect failed" }, { status: 500 });
  }
}
