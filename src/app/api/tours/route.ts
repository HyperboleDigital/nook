import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createCapture, uploadVideoToLuma } from "@/lib/luma";
import { supabaseAdmin } from "@/lib/supabase";
import { nanoid } from "nanoid";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const file = formData.get("file") as File;

  if (!title || !file) {
    return NextResponse.json({ error: "title and file are required" }, { status: 400 });
  }

  // Create capture in Luma
  const capture = await createCapture(title);

  // Upload video to Luma's signed URL
  const videoBuffer = await file.arrayBuffer();
  await uploadVideoToLuma(capture.upload_url, videoBuffer, file.type || "video/mp4");

  // Store in Supabase
  const { data, error } = await supabaseAdmin
    .from("tours")
    .insert({
      user_id: userId,
      title,
      luma_capture_id: capture.capture?.slug ?? capture.slug,
      status: "processing",
      public_slug: nanoid(10),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
