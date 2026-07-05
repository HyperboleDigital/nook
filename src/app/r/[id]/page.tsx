import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { DetectedObject, Restyle, RestyleEdit } from "@/types";
import ShareCanvas, { type ShareHotspot } from "./ShareCanvas";

export const metadata = { title: "Room design — Nook" };

// Public, read-only view of a rendered room + its shoppable products — full-viewport, same
// immersive treatment as the editor (see (studio)/restyle/[id]/RestyleCanvas.tsx), but with no
// edit actions: tapping a hotspot only opens a thumbnail/price/Buy popover. Anyone with the
// link (an unguessable id) can view; no auth (src/proxy.ts has "/r/(.*)" as a public route).
export default async function PublicRestylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data } = await supabaseAdmin.from("restyles").select("*").eq("id", id).single();
  const restyle = data as Restyle | null;
  if (!restyle || !restyle.current_url) notFound();

  // Products shown = those in the currently-displayed render (via its signature).
  const { data: renders } = await supabaseAdmin
    .from("restyle_renders").select("signature, image_url").eq("restyle_id", id);
  const current = (renders ?? []).find((r) => r.image_url === restyle.current_url);
  const signatureIds = current ? new Set(current.signature.split(",")) : null;

  const { data: allEdits } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", id);
  const products = ((allEdits ?? []) as RestyleEdit[]).filter(
    (e) => e.buy_url && (signatureIds ? signatureIds.has(e.id) : e.active),
  );

  // Never show hotspots on the unedited photo — nothing's actually been generated into it yet
  // (mirrors the editor's "never show placed UI on the original" rule, see CLAUDE.md).
  const hasRender = restyle.current_url !== restyle.original_url;
  const detected = (restyle.detected_objects as DetectedObject[] | null) ?? [];
  const hotspots: ShareHotspot[] = [];
  if (hasRender) {
    for (const e of products) {
      const obj = detected.find((o) => o.label.toLowerCase() === e.target_label?.toLowerCase());
      if (obj) { hotspots.push({ label: e.target_label!, box_2d: obj.box_2d, edit: e }); continue; }
      if (e.kind === "add" && e.placement) {
        const box: DetectedObject["box_2d"] = [
          Math.max(0, e.placement.y - 40), Math.max(0, e.placement.x - 40),
          Math.min(1000, e.placement.y + 40), Math.min(1000, e.placement.x + 40),
        ];
        hotspots.push({ label: e.target_label ?? "item", box_2d: box, edit: e });
      }
    }
  }

  return (
    <ShareCanvas
      imageUrl={restyle.current_url}
      width={restyle.width}
      height={restyle.height}
      title={restyle.title}
      hotspots={hotspots}
      products={products}
    />
  );
}
