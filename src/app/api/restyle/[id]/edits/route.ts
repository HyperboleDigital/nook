import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage, adoptCachedRenderIfKnown } from "@/lib/restyle-render";
import { describeProduct } from "@/lib/gemini";
import { fileToBuffer } from "@/lib/file-buf";
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
    const rbuf = await fileToBuffer(referenceFile);
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

  // A slot can only hold one active outcome at a time — swapping, adding, or removing the
  // same target_label are mutually exclusive, so staging any one deactivates the others.
  if ((kind === "item" || kind === "add" || kind === "remove") && targetLabel) {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("target_label", targetLabel).in("kind", ["item", "add", "remove"]).neq("id", inserted.id);
  }
  // A "refine" (custom free-text instruction, e.g. "mount it on the wall") is its OWN dedupe
  // group, independent of item/add/remove — it's additive to whatever's currently in that slot,
  // not a replacement of it. Only one active refine per label though, so a second instruction
  // replaces the first rather than stacking (possibly contradictory) adjustments.
  if (kind === "refine" && targetLabel) {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("target_label", targetLabel).eq("kind", "refine").neq("id", inserted.id);
  }

  return NextResponse.json({ edits: await editsFor(id), current_url: await adoptCachedRenderIfKnown(id) });
}

// PATCH — toggle active state and/or set placement.
// JSON: { editId, active?, kind?, placement? } or { states: { [editId]: bool } }.
// placement is {x, y, note?} in 0–1000 box_2d space, or null to clear.
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
    if (body.placement === null) {
      update.placement = null;
    } else if (body.placement && typeof body.placement === "object") {
      const { x, y, note } = body.placement;
      if (typeof x === "number" && typeof y === "number" && x >= 0 && x <= 1000 && y >= 0 && y <= 1000) {
        update.placement = {
          x: Math.round(x),
          y: Math.round(y),
          note: typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null,
        };
      }
    }
    if (Object.keys(update).length) {
      await supabaseAdmin.from("restyle_edits").update(update).eq("id", body.editId).eq("restyle_id", id);
    }

    // Changing placement changes what this edit renders as, but the render cache is keyed
    // by edit IDs only — so any cached render containing this edit is now stale. Delete the
    // rows (not the blobs: current_url may still point at one; the image keeps displaying,
    // and the next generate re-renders fresh instead of cache-hitting the old placement).
    if (update.placement !== undefined) {
      const { data: cachedRows } = await supabaseAdmin
        .from("restyle_renders").select("id, signature").eq("restyle_id", id);
      const stale = (cachedRows ?? []).filter((r) => r.signature.split(",").includes(body.editId));
      if (stale.length) {
        await supabaseAdmin.from("restyle_renders").delete().in("id", stale.map((r) => r.id));
      }
    }
  }

  return NextResponse.json({ edits: await editsFor(id), current_url: await adoptCachedRenderIfKnown(id) });
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

  // Drop any cached render that was composed WITH this edit — its signature now references a
  // deleted id, so it can never be faithfully restored (the product is gone) and would otherwise
  // show up in the versions gallery as a version whose product isn't in the changes list. Only the
  // render rows go, not the blobs (current_url may still point at one and should keep displaying).
  const { data: cachedRows } = await supabaseAdmin
    .from("restyle_renders").select("id, signature").eq("restyle_id", id);
  const stale = (cachedRows ?? []).filter((r) => (r.signature as string).split(",").includes(editId));
  if (stale.length) await supabaseAdmin.from("restyle_renders").delete().in("id", stale.map((r) => r.id));

  return NextResponse.json({ edits: await editsFor(id), current_url: await adoptCachedRenderIfKnown(id) });
}
