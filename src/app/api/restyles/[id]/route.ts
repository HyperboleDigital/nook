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

  const { data: versions } = await supabaseAdmin
    .from("restyle_versions").select("*").eq("restyle_id", id).order("created_at", { ascending: true });

  return NextResponse.json({ ...restyle, versions: versions ?? [] });
}

// PATCH /api/restyles/[id] — revert: set current_url to a chosen version's image.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { currentUrl } = await req.json();
  if (!currentUrl) return NextResponse.json({ error: "currentUrl required" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("restyles")
    .update({ current_url: currentUrl, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
