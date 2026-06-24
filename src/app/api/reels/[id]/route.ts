import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getGeneration } from "@/lib/higgsfield";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: reel } = await supabaseAdmin
    .from("reels")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!reel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (reel.status === "complete" || reel.status === "failed") {
    return NextResponse.json(reel);
  }

  const generation = await getGeneration(reel.higgsfield_generation_id);

  if (generation.status === "completed") {
    await supabaseAdmin
      .from("reels")
      .update({ status: "complete", output_url: generation.output_url })
      .eq("id", id);
    return NextResponse.json({ ...reel, status: "complete", output_url: generation.output_url });
  }

  if (generation.status === "failed") {
    await supabaseAdmin.from("reels").update({ status: "failed" }).eq("id", id);
    return NextResponse.json({ ...reel, status: "failed" });
  }

  return NextResponse.json({ ...reel, status: "processing" });
}
