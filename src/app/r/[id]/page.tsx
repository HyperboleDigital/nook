import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { DetectedObject, Restyle, RestyleEdit } from "@/types";
import ShareCanvas, { type ShareHotspot } from "./ShareCanvas";

export const metadata = { title: "Room design — Nook" };

// Public, read-only view of a rendered room + everything changed in it — full-viewport, same
// immersive treatment as the editor (see (studio)/restyle/[id]/RestyleCanvas.tsx), but with no
// edit actions: tapping a hotspot only opens an info/Buy popover. Anyone with the link (an
// unguessable id) can view; no auth (src/proxy.ts has "/r/(.*)" as a public route).
export default async function PublicRestylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data } = await supabaseAdmin.from("restyles").select("*").eq("id", id).single();
  const restyle = data as Restyle | null;
  if (!restyle || !restyle.current_url) notFound();

  // Everything shown (hotspots AND the rail) reflects the CURRENTLY-DISPLAYED render, not just
  // whatever's ever been staged — via its signature, same mechanism as the editor's
  // shownProductIds (useRestyleWorkspace.ts).
  const { data: renders } = await supabaseAdmin
    .from("restyle_renders").select("signature, image_url").eq("restyle_id", id);
  const current = (renders ?? []).find((r) => r.image_url === restyle.current_url);
  const signatureIds = current ? new Set(current.signature.split(",")) : null;

  const { data: allEdits } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", id);
  // Every edit actually reflected in the current photo — NOT filtered to buy_url, unlike the
  // old version of this page. A console swap sourced from a photo/description, or a removed
  // item, is just as real a change as a linked product; it used to be silently dropped from
  // both the hotspots and the rail here, which is why the room could show real changes yet the
  // panel said "no shoppable products" and nothing on the photo was tappable.
  const activeInRender = ((allEdits ?? []) as RestyleEdit[]).filter(
    (e) => signatureIds ? signatureIds.has(e.id) : e.active,
  );

  // Never show hotspots on the unedited photo — nothing's actually been generated into it yet
  // (mirrors the editor's "never show placed UI on the original" rule, see CLAUDE.md).
  const hasRender = restyle.current_url !== restyle.original_url;
  const detected = (restyle.detected_objects as DetectedObject[] | null) ?? [];
  const hotspots: ShareHotspot[] = [];
  if (hasRender) {
    // Detected items with an active item/remove edit — an untouched item has nothing to show
    // here (no edit, nothing to shop, nothing to say), so it gets no hotspot at all.
    for (const o of detected) {
      const edit = activeInRender.find(
        (e) => (e.kind === "item" || e.kind === "remove") && e.target_label?.toLowerCase() === o.label.toLowerCase(),
      );
      if (!edit) continue;
      // A placed remove means the item is actually gone — an empty patch of floor isn't
      // tappable (matches the editor's canvasHotspots rule).
      if (edit.kind === "remove") continue;
      hotspots.push({ label: o.label, box_2d: o.box_2d, edit });
    }
    // Pinned "add" edits use a box synthesized around their placement point — `w`/`h` (half-
    // extents) come from an auto-located item's actual detected size when present, else a
    // generic small box (see useRestyleWorkspace.ts's boxFromPlacement, mirrored here since
    // that lives in a "use client" module).
    for (const e of activeInRender) {
      if (e.kind !== "add" || !e.placement || !e.target_label) continue;
      const halfW = e.placement.w ?? 40, halfH = e.placement.h ?? 40;
      const box: DetectedObject["box_2d"] = [
        Math.max(0, e.placement.y - halfH), Math.max(0, e.placement.x - halfW),
        Math.min(1000, e.placement.y + halfH), Math.min(1000, e.placement.x + halfW),
      ];
      hotspots.push({ label: e.target_label, box_2d: box, edit: e });
    }
  }

  return (
    <ShareCanvas
      imageUrl={restyle.current_url}
      width={restyle.width}
      height={restyle.height}
      title={restyle.title}
      hotspots={hotspots}
      edits={activeInRender}
    />
  );
}
