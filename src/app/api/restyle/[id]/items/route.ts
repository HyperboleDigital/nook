import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const MAX_CUSTOM = 5;

async function loadOwned(restyleId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("restyles").select("*").eq("id", restyleId).eq("user_id", userId).single();
  return data;
}
async function editsFor(restyleId: string) {
  const { data } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", restyleId).order("position", { ascending: true });
  return data ?? [];
}

// POST — add a custom item label (capped at MAX_CUSTOM). Body: { label }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { label } = await req.json();
  const clean = (label ?? "").trim();
  if (!clean) return NextResponse.json({ error: "label required" }, { status: 400 });

  const custom: string[] = restyle.custom_items ?? [];
  if (custom.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return NextResponse.json({ custom_items: custom });
  }
  if (custom.length >= MAX_CUSTOM) {
    return NextResponse.json({ error: `You can add up to ${MAX_CUSTOM} custom items.` }, { status: 400 });
  }
  const next = [...custom, clean];
  await supabaseAdmin.from("restyles").update({ custom_items: next }).eq("id", id);
  return NextResponse.json({ custom_items: next });
}

// DELETE — remove a custom item + its edits. ?label=
// Does NOT recompose — call POST /generate to render the updated set.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const label = new URL(req.url).searchParams.get("label");
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });

  const custom: string[] = restyle.custom_items ?? [];
  const next = custom.filter((c) => c !== label);
  await supabaseAdmin.from("restyles").update({ custom_items: next }).eq("id", id);
  await supabaseAdmin.from("restyle_edits").delete().eq("restyle_id", id).eq("target_label", label);

  return NextResponse.json({ custom_items: next, edits: await editsFor(id) });
}
