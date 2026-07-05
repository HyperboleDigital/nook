import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { detectObjects, type DetectProvider } from "@/lib/detect";
import { supabaseAdmin } from "@/lib/supabase";
import { fileToBuffer } from "@/lib/file-buf";

export const maxDuration = 60;

// POST /api/restyle/detect — detect editable objects in a room image for
// tap-to-select editing. JSON { imageUrl, restyleId? } or multipart `image`.
// When restyleId is given, the result is cached on the matching version row.
//
// A/B override: `?provider=openai|gemini` (query) or `provider` (JSON body) forces a detector,
// bypassing the DETECTION_PROVIDER default — so the same room can be re-detected with each one
// to compare. The result still overwrites `detected_objects`, so calling this route again is
// also how you re-run detection on an existing room after switching providers.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let base64: string;
    let mimeType: string;
    let imageUrl: string | null = null;
    let restyleId: string | null = null;
    const qsProvider = new URL(req.url).searchParams.get("provider");
    let provider: DetectProvider | undefined = qsProvider === "openai" || qsProvider === "gemini" ? qsProvider : undefined;

    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("application/json")) {
      const body = await req.json();
      imageUrl = body.imageUrl;
      restyleId = body.restyleId ?? null;
      if (body.provider === "openai" || body.provider === "gemini") provider = body.provider;
      if (!imageUrl) return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
      const res = await fetch(imageUrl);
      base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      mimeType = res.headers.get("content-type") || "image/png";
    } else {
      const form = await req.formData();
      const file = form.get("image") as File | null;
      if (!file) return NextResponse.json({ error: "image required" }, { status: 400 });
      base64 = (await fileToBuffer(file)).toString("base64");
      mimeType = file.type || "image/jpeg";
    }

    const objects = await detectObjects({ imageBase64: base64, mimeType }, provider);

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
