import { supabaseAdmin } from "@/lib/supabase";
import type { DetectedObject, Restyle, RestyleEdit } from "@/types";

/** Load a restyle project, scoped to its owner. Shared by every restyle-project route. */
export async function loadOwnedRestyle(restyleId: string, userId: string): Promise<Restyle | null> {
  const { data } = await supabaseAdmin
    .from("restyles").select("*").eq("id", restyleId).eq("user_id", userId).single();
  return data;
}

export async function editsFor(restyleId: string): Promise<RestyleEdit[]> {
  const { data } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", restyleId).order("position", { ascending: true });
  return data ?? [];
}

/** Find a detected object whose label overlaps the product's item type (→ replace it). */
export function matchDetected(objects: DetectedObject[] | null, itemType: string): string | null {
  if (!objects?.length) return null;
  const t = itemType.toLowerCase();
  const hit = objects.find((o) => {
    const l = o.label.toLowerCase();
    return l === t || l.includes(t) || t.includes(l);
  });
  return hit?.label ?? null;
}

export interface StagedProduct {
  referenceUrl: string;
  referenceDesc: string;
  itemType: string;
  buyUrl: string | null;
  productTitle: string | null;
  productPrice: string | null;
  retailer: string;
}

/**
 * Insert a reference edit and enforce "single active edit per target_label" — a label is
 * one conceptual slot in the room regardless of kind (item = swap of a detected object,
 * add = a custom item with no match). This used to only cover kind "item", so staging a
 * photo as an "add" and later picking a real product for the same label left both edits
 * active simultaneously (stale thumbnail, product missing from "Shop this look"). kind can
 * also flip item⇄add via the swap/add toggle, so dedupe matches on label across both kinds.
 */
export async function stageEdit(
  restyleId: string,
  restyle: Pick<Restyle, "detected_objects">,
  staged: StagedProduct,
  forcedTarget?: string,
): Promise<{ edits: RestyleEdit[]; added: { id: string; kind: "item" | "add"; target_label: string; retailer: string } }> {
  let kind: "item" | "add";
  let targetLabel: string;
  if (forcedTarget) {
    const inDetected = (restyle.detected_objects as DetectedObject[] | null)
      ?.some((o) => o.label.toLowerCase() === forcedTarget.toLowerCase());
    kind = inDetected ? "item" : "add";
    targetLabel = forcedTarget;
  } else {
    const matched = matchDetected(restyle.detected_objects as DetectedObject[] | null, staged.itemType);
    kind = matched ? "item" : "add";
    targetLabel = matched ?? staged.itemType;
  }

  const existing = await editsFor(restyleId);
  const position = existing.length;

  const { data: inserted, error } = await supabaseAdmin.from("restyle_edits").insert({
    restyle_id: restyleId, kind, target_label: targetLabel, instruction: null,
    reference_url: staged.referenceUrl, reference_desc: staged.referenceDesc,
    buy_url: staged.buyUrl, product_title: staged.productTitle, product_price: staged.productPrice,
    active: true, position,
  }).select().single();
  if (error || !inserted) throw new Error(error?.message ?? "DB error staging edit");

  if (targetLabel) {
    // A slot holds one active outcome — swap, add, or remove of the same target_label are
    // mutually exclusive, so staging any one deactivates the others (see edits/route.ts POST).
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", restyleId).eq("target_label", targetLabel).in("kind", ["item", "add", "remove"]).neq("id", inserted.id);
  }

  return {
    edits: await editsFor(restyleId),
    added: { id: inserted.id, kind, target_label: targetLabel, retailer: staged.retailer },
  };
}
