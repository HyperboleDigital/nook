import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/restyles/[id] — a restyle project + its ordered versions.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: restyle } = await supabaseAdmin
    .from("restyles").select("*").eq("id", id).eq("user_id", userId).single();
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: edits } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", id).order("position", { ascending: true });

  const { data: renders } = await supabaseAdmin
    .from("restyle_renders")
    .select("id, restyle_id, signature, image_url, created_at")
    .eq("restyle_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ...restyle, edits: edits ?? [], renders: renders ?? [] });
}

// PATCH /api/restyles/[id] — update title and/or current_url.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.currentUrl) updates.current_url = body.currentUrl;
  if (typeof body.title === "string") updates.title = body.title || null;
  if (Object.keys(updates).length === 1) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("restyles").update(updates).eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
