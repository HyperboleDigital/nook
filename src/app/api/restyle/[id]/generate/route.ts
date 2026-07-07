import { auth } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recompose } from "@/lib/restyle-render";
import { searchProductByImageUrl } from "@/lib/restyle-search";
import { locateItemInRoom } from "@/lib/gemini";
import { ensureWholeRoomEdit } from "@/lib/restyle-whole-room-edit";
import { RESTYLE_THEMES, type RestyleThemeKey } from "@/lib/restyle-themes";
import type { RestyleEdit } from "@/types";

// Render (Gemini compose) + the deferred inspo product search both run in after() below, so
// this needs to cover both — bumped from 120 when generate became fire-and-forget.
export const maxDuration = 300;

// POST — fire-and-forget. Optionally applies a server-side edit-state change first (so
// toggling an item, emptying the room, or staging it is one atomic call instead of a client
// for-loop that dies if the tab closes mid-sequence), then responds 202 immediately and does the
// actual render (+ deferred product search) in after() — the client polls GET
// /api/restyles/[id] (see useRestyleWorkspace's pollGenerating) until generating_started_at
// clears. Body (all optional): { toggle?: {editId, active}, emptyRoom?: boolean, stageRoom?: {theme} }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: restyle } = await supabaseAdmin
    .from("restyles").select("*").eq("id", id).eq("user_id", userId).single();
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.toggle?.editId && typeof body.toggle.active === "boolean") {
    await supabaseAdmin.from("restyle_edits").update({ active: body.toggle.active })
      .eq("id", body.toggle.editId).eq("restyle_id", id);
  }
  if (body.emptyRoom) {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("active", true).neq("kind", "remove");
    await ensureWholeRoomEdit(id, "remove");
  }
  // "Stage this room" — empty the room AND furnish it in a curated style, in one generate: a
  // whole-room "remove" edit (identical to plain "Empty the room") PLUS a whole-room "style"
  // edit whose instruction is the picked theme's furnish-oriented blurb. Both compose into ONE
  // Gemini call via the normal composeEdits path (see gemini.ts's `case "style"`/`case "remove"`)
  // — no separate render pipeline needed. Deactivates everything else first, same "start fresh"
  // semantics as Empty the room, just also staging a style on top.
  if (body.stageRoom?.theme) {
    const theme = RESTYLE_THEMES[body.stageRoom.theme as RestyleThemeKey];
    if (theme) {
      const { data: activeNow } = await supabaseAdmin
        .from("restyle_edits").select("id, kind").eq("restyle_id", id).eq("active", true);
      const toDeactivate = (activeNow ?? [])
        .filter((e) => e.kind !== "remove" && e.kind !== "style")
        .map((e) => e.id);
      if (toDeactivate.length > 0) {
        await supabaseAdmin.from("restyle_edits").update({ active: false }).in("id", toDeactivate);
      }
      await ensureWholeRoomEdit(id, "remove");
      await ensureWholeRoomEdit(id, "style", theme.stagingInstruction);
    }
  }

  // Marked BEFORE the (potentially long) work below, not after — this is what lets a fresh
  // page load detect an in-progress generate and resume showing it. The invocation itself
  // (both the initial handler and the after() continuation) runs to completion on the server
  // regardless of whether the client is still connected.
  const startedAt = new Date().toISOString();
  await supabaseAdmin.from("restyles")
    .update({ generating_started_at: startedAt, generate_error: null })
    .eq("id", id);

  after(async () => {
    try {
      const renderedUrl = await recompose(restyle, userId);

      const { data: activeEdits } = await supabaseAdmin
        .from("restyle_edits").select("*").eq("restyle_id", id).eq("active", true);

      // An "add" edit the user never manually pinned (skipped the location step, or Generate
      // ran before they got to it) still gets placed SOMEWHERE by Nano Banana — locate it in
      // the fresh render so it gets a real canvas hotspot too, same as a swap, instead of only
      // being reachable via "Choose a spot" in the changes rail forever. Best-effort: a miss
      // just leaves it as it was (still reachable via "Choose a spot"), no error surfaced.
      const unpinnedAdds = ((activeEdits ?? []) as RestyleEdit[]).filter(
        (e) => e.kind === "add" && e.target_label && !e.placement,
      );
      if (unpinnedAdds.length > 0) {
        const imgRes = await fetch(renderedUrl);
        const imageBase64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
        const mimeType = imgRes.headers.get("content-type") || "image/png";
        for (const e of unpinnedAdds) {
          const box = await locateItemInRoom({ imageBase64, mimeType, label: e.target_label! });
          if (!box) continue;
          const [ymin, xmin, ymax, xmax] = box;
          // Store the box's actual half-extents (w/h), not just its center — a generic small
          // fixed-size box around the center point badly undersizes a tall/wide item like a
          // floor plant or a rug, making the hotspot look like it's floating near the item
          // rather than around it.
          const placement = {
            x: Math.round((xmin + xmax) / 2), y: Math.round((ymin + ymax) / 2), note: null,
            w: Math.round((xmax - xmin) / 2), h: Math.round((ymax - ymin) / 2),
          };
          await supabaseAdmin.from("restyle_edits").update({ placement }).eq("id", e.id);
        }
      }

      // Deferred product search: now that the room is actually generated, look up buyable
      // options for any inspo-only edit (a reference photo, no buy_url yet) that ended up
      // active in this render — scoped to what actually made it in, not everything ever
      // staged (see the CLAUDE.md "deferred search" product decision). Runs fully server-side
      // (fast + finish both awaited here) so it survives the client disconnecting.
      const inspo = ((activeEdits ?? []) as RestyleEdit[]).filter(
        (e) => e.reference_url && !e.buy_url && e.target_label,
      );
      for (const e of inspo) {
        const search = await searchProductByImageUrl({
          restyleId: id, imageUrl: e.reference_url!, label: e.target_label!.toLowerCase(),
        });
        if (search.ok) await search.finish();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      await supabaseAdmin.from("restyles").update({ generate_error: message }).eq("id", id);
    } finally {
      await supabaseAdmin.from("restyles").update({ generating_started_at: null }).eq("id", id);
    }
  });

  return NextResponse.json({ generatingStartedAt: startedAt }, { status: 202 });
}
