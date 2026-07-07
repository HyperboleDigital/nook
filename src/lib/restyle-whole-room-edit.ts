import { supabaseAdmin } from "@/lib/supabase";
import type { RestyleEditKind } from "@/types";

/**
 * Ensure exactly one active, `target_label: null` (whole-room) row of `kind` exists for this
 * restyle — reactivate-and-refresh an existing one (keeps its id/position stable across repeat
 * "Empty the room" / "Stage this room" calls, rather than accumulating stale rows) or insert a
 * fresh one. `instruction` is written every time — a "style" row's instruction can change
 * between two "Stage this room" runs with a different theme picked; a "remove" row's is always
 * null, so this is a no-op for it. Does NOT touch `active` on any OTHER row — callers decide
 * what else to deactivate first (see generate/route.ts's `emptyRoom`/`stageRoom` branches).
 */
export async function ensureWholeRoomEdit(
  restyleId: string,
  kind: RestyleEditKind,
  instruction: string | null = null,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("restyle_edits").select("id").eq("restyle_id", restyleId)
    .eq("kind", kind).is("target_label", null).maybeSingle();
  if (existing) {
    await supabaseAdmin.from("restyle_edits")
      .update({ active: true, instruction }).eq("id", existing.id);
  } else {
    const { data: rows } = await supabaseAdmin
      .from("restyle_edits").select("id").eq("restyle_id", restyleId);
    await supabaseAdmin.from("restyle_edits").insert({
      restyle_id: restyleId, kind, target_label: null, instruction,
      active: true, position: rows?.length ?? 0,
    });
  }
}
