import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recompose } from "@/lib/restyle-render";

// Image generation (Gemini compose over multiple edits) can run long.
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: restyle } = await supabaseAdmin
    .from("restyles").select("*").eq("id", id).eq("user_id", userId).single();
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const url = await recompose(restyle, userId);
    const { data: edits } = await supabaseAdmin
      .from("restyle_edits").select("*").eq("restyle_id", id).order("position", { ascending: true });
    const { data: renders } = await supabaseAdmin
      .from("restyle_renders")
      .select("id, restyle_id, signature, image_url, created_at")
      .eq("restyle_id", id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ url, edits: edits ?? [], renders: renders ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}
