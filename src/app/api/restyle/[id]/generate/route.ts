import { auth } from "@clerk/nextjs/server";
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { recompose } from "@/lib/restyle-render";
import { searchProductByImageUrl } from "@/lib/restyle-search";
import type { RestyleEdit } from "@/types";

// Render (Gemini compose) + the deferred inspo product search both run in after() below, so
// this needs to cover both — bumped from 120 when generate became fire-and-forget.
export const maxDuration = 300;

// POST — fire-and-forget. Optionally applies a server-side edit-state change first (so
// toggling an item or emptying the room is one atomic call instead of a client for-loop that
// dies if the tab closes mid-sequence), then responds 202 immediately and does the actual
// render (+ deferred product search) in after() — the client polls GET /api/restyles/[id]
// (see useRestyleWorkspace's pollGenerating) until generating_started_at clears.
// Body (all optional): { toggle?: {editId, active}, emptyRoom?: boolean }.
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
    const { data: existingRemove } = await supabaseAdmin
      .from("restyle_edits").select("id").eq("restyle_id", id).eq("kind", "remove").is("target_label", null).maybeSingle();
    if (existingRemove) {
      await supabaseAdmin.from("restyle_edits").update({ active: true }).eq("id", existingRemove.id);
    } else {
      const { data: existing } = await supabaseAdmin.from("restyle_edits").select("id").eq("restyle_id", id);
      await supabaseAdmin.from("restyle_edits").insert({
        restyle_id: id, kind: "remove", target_label: null, active: true, position: existing?.length ?? 0,
      });
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
      await recompose(restyle, userId);

      // Deferred product search: now that the room is actually generated, look up buyable
      // options for any inspo-only edit (a reference photo, no buy_url yet) that ended up
      // active in this render — scoped to what actually made it in, not everything ever
      // staged (see the CLAUDE.md "deferred search" product decision). Runs fully server-side
      // (fast + finish both awaited here) so it survives the client disconnecting.
      const { data: activeEdits } = await supabaseAdmin
        .from("restyle_edits").select("*").eq("restyle_id", id).eq("active", true);
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
