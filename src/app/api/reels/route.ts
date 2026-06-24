import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createGeneration, buildReelPrompt } from "@/lib/higgsfield";
import { supabaseAdmin } from "@/lib/supabase";
import type { ReelStyle, ReelModel } from "@/lib/higgsfield";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const address = (formData.get("address") as string) || undefined;
  const style = (formData.get("style") as ReelStyle) || "cinematic";
  const model = (formData.get("model") as ReelModel) || "kling-3.0";
  const files = formData.getAll("files") as File[];

  if (!title || files.length === 0) {
    return NextResponse.json({ error: "title and at least one file required" }, { status: 400 });
  }

  // Upload reference images to Supabase Storage then pass URLs to Higgsfield
  const imageUrls: string[] = [];
  for (const file of files.slice(0, 10)) {
    if (!file.type.startsWith("image/")) continue;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `reels/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data: uploaded } = await supabaseAdmin.storage
      .from("nook-uploads")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploaded) {
      const { data: publicUrl } = supabaseAdmin.storage
        .from("nook-uploads")
        .getPublicUrl(uploaded.path);
      imageUrls.push(publicUrl.publicUrl);
    }
  }

  const prompt = buildReelPrompt(style, address);
  const generation = await createGeneration({ prompt, referenceImageUrls: imageUrls, style, model });

  const { data, error } = await supabaseAdmin
    .from("reels")
    .insert({
      user_id: userId,
      title,
      higgsfield_generation_id: generation.id,
      status: "processing",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id });
}
