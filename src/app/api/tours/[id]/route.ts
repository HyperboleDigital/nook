import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getCapture } from "@/lib/luma";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: tour } = await supabaseAdmin
    .from("tours")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!tour) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tour.status === "complete" || tour.status === "failed") {
    return NextResponse.json(tour);
  }

  // Poll Luma for status
  const capture = await getCapture(tour.luma_capture_id);
  const lumaStatus: string = capture.capture?.status ?? capture.status;

  if (lumaStatus === "complete") {
    const plyUrl = capture.capture?.assets?.[0]?.url ?? capture.assets?.[0]?.url;
    await supabaseAdmin
      .from("tours")
      .update({ status: "complete", ply_url: plyUrl })
      .eq("id", id);
    return NextResponse.json({ ...tour, status: "complete", ply_url: plyUrl });
  }

  if (lumaStatus === "failed") {
    await supabaseAdmin.from("tours").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ ...tour, status: "failed" });
  }

  return NextResponse.json({ ...tour, status: "processing" });
}
