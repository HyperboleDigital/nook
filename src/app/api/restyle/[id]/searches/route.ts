import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadOwnedRestyle } from "@/lib/restyle-edits";
import { getUserPlan, searchTierForPlan } from "@/lib/plan";

// GET — server-persisted product-search results for this project, replacing the client's
// per-device localStorage cache. Optional ?label= filters to one item slot.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwnedRestyle(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const label = new URL(req.url).searchParams.get("label")?.trim().toLowerCase();

  let query = supabaseAdmin.from("restyle_searches").select("label, results, scored, updated_at").eq("restyle_id", id);
  if (label != null) query = query.eq("label", label);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // `locked` is derived from the CURRENT plan at read time (not stored), so upgrading immediately
  // ungates: a free reader sees the one persisted match + a "more behind upgrade" flag, a paid
  // reader sees everything. (Free rows were also capped to one result when written — see the
  // visual-search route / searchTierForPlan — so this flag just tells the UI to show the CTA.)
  const { locked } = searchTierForPlan(await getUserPlan(userId));
  const searches = (data ?? []).map((row) => ({ ...row, locked }));

  return NextResponse.json({ searches });
}
