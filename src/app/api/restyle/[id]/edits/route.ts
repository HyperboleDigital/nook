import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/restyle-render";
import { describeProduct } from "@/lib/gemini";
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

// POST — add a change layer. Multipart: kind, targetLabel?, instruction?, reference?(file).
// Does NOT recompose — the client calls POST /generate when ready to render.
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
  const referenceFile = form.get("reference") as File | null;

  let referenceUrl: string | null = null;
  let referenceDesc: string | null = null;
  if (referenceFile) {
    const rbuf = Buffer.from(new Uint8Array(await referenceFile.arrayBuffer()));
    const rmime = referenceFile.type || "image/jpeg";
    referenceUrl = await uploadImage(userId, rbuf, rmime);
    referenceDesc = await describeProduct({
      imageBase64: rbuf.toString("base64"), mimeType: rmime, label: targetLabel ?? "item",
    });
  }

  const existing = await editsFor(id);
  const position = existing.length;

  const { data: inserted, error } = await supabaseAdmin.from("restyle_edits").insert({
    restyle_id: id, kind, target_label: targetLabel, instruction,
    reference_url: referenceUrl, reference_desc: referenceDesc,
    active: true, position,
  }).select().single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });

  if (kind === "item" && targetLabel) {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("kind", "item").eq("target_label", targetLabel).neq("id", inserted.id);
  }

  return NextResponse.json({ edits: await editsFor(id) });
}

// PATCH — toggle active state. JSON: { editId, active } or { states: { [editId]: bool } }.
// Does NOT recompose — call POST /generate to render the current active set.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  if (body.states && typeof body.states === "object") {
    for (const [editId, active] of Object.entries(body.states)) {
      await supabaseAdmin.from("restyle_edits").update({ active: !!active }).eq("id", editId).eq("restyle_id", id);
    }
  } else if (body.editId) {
    const update: Record<string, unknown> = {};
    if (typeof body.active === "boolean") update.active = body.active;
    if (body.kind === "item" || body.kind === "add") update.kind = body.kind; // replace ⇄ add toggle
    if (Object.keys(update).length) {
      await supabaseAdmin.from("restyle_edits").update(update).eq("id", body.editId).eq("restyle_id", id);
    }
  }

  return NextResponse.json({ edits: await editsFor(id) });
}

// DELETE — remove a layer. ?editId=
// Does NOT recompose — call POST /generate to render the updated active set.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const editId = new URL(req.url).searchParams.get("editId");
  if (!editId) return NextResponse.json({ error: "editId required" }, { status: 400 });
  await supabaseAdmin.from("restyle_edits").delete().eq("id", editId).eq("restyle_id", id);

  return NextResponse.json({ edits: await editsFor(id) });
}
