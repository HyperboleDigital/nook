import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const ext = searchParams.get("ext")?.replace(/[^a-z0-9]/gi, "") || "mp4";

  const storagePath = `tours/${userId}/${Date.now()}.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from("nook-uploads")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create upload URL" }, { status: 500 });
  }

  return NextResponse.json({ uploadUrl: data.signedUrl, storagePath });
}
