import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recompose, uploadImage } from "@/lib/restyle-render";
import type { RestyleEditKind } from "@/types";

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

// POST — add a change layer. Multipart: kind, targetLabel?, instruction?, model?, reference?(file).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const kind = ((form.get("kind") as string) || "item") as RestyleEditKind;
  const targetLabel = (form.get("targetLabel") as string) || null;
  const instruction = (form.get("instruction") as string) || null;
  const model = ((form.get("model") as string) || undefined) as "flash" | "pro" | undefined;
  const referenceFile = form.get("reference") as File | null;

  let referenceUrl: string | null = null;
  if (referenceFile) {
    const rbuf = Buffer.from(await referenceFile.arrayBuffer());
    referenceUrl = await uploadImage(userId, rbuf, referenceFile.type || "image/jpeg");
  }

  const existing = await editsFor(id);
  const position = existing.length;

  const { data: inserted, error } = await supabaseAdmin.from("restyle_edits").insert({
    restyle_id: id, kind, target_label: targetLabel, instruction, reference_url: referenceUrl, active: true, position,
  }).select().single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });

  // Options for the same item are alternatives — adding a new one deactivates the
  // others so only one option per item is applied at a time.
  if (kind === "item" && targetLabel) {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("kind", "item").eq("target_label", targetLabel).neq("id", inserted.id);
  }

  try {
    const url = await recompose(restyle, userId, model);
    return NextResponse.json({ url, edits: await editsFor(id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}

// PATCH — toggle a layer on/off. JSON: { editId, active }.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const model = body.model as "flash" | "pro" | undefined;

  // Accept a single { editId, active } or a bulk { states: { [editId]: bool } } so
  // many toggles collapse into ONE recompose (no wasted intermediate renders).
  if (body.states && typeof body.states === "object") {
    for (const [editId, active] of Object.entries(body.states)) {
      await supabaseAdmin.from("restyle_edits").update({ active: !!active }).eq("id", editId).eq("restyle_id", id);
    }
  } else if (body.editId) {
    await supabaseAdmin.from("restyle_edits").update({ active: !!body.active }).eq("id", body.editId).eq("restyle_id", id);
  }

  try {
    const url = await recompose(restyle, userId, model);
    return NextResponse.json({ url, edits: await editsFor(id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}

// DELETE — remove a layer. ?editId=
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const editId = new URL(req.url).searchParams.get("editId");
  if (!editId) return NextResponse.json({ error: "editId required" }, { status: 400 });
  await supabaseAdmin.from("restyle_edits").delete().eq("id", editId).eq("restyle_id", id);

  try {
    const url = await recompose(restyle, userId);
    return NextResponse.json({ url, edits: await editsFor(id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Render failed" }, { status: 500 });
  }
}
