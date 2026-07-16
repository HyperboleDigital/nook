import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminEmail } from "@/lib/plan";
import type { PlanType } from "@/types";

// Dev-only "toggle my plan for testing" endpoint — lets an admin flip their OWN account between
// free/pro so they can exercise the plan-gated product search without a real Stripe change. Gated
// strictly to ADMIN_EMAILS (see isAdminEmail); a non-admin can never change a plan here.

async function loadUser(clerkId: string) {
  const { data } = await supabaseAdmin
    .from("users").select("email, plan").eq("clerk_id", clerkId).maybeSingle();
  return data as { email: string | null; plan: PlanType } | null;
}

// GET — { isAdmin, plan } for the current user (drives whether the toggle renders + its state).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = await loadUser(userId);
  return NextResponse.json({ isAdmin: isAdminEmail(u?.email), plan: u?.plan ?? "free" });
}

// POST { plan } — set the current (admin) user's plan. Admin-only.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = await loadUser(userId);
  if (!isAdminEmail(u?.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const plan = body.plan as unknown;
  if (plan !== "free" && plan !== "starter" && plan !== "pro") {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  await supabaseAdmin.from("users").update({ plan }).eq("clerk_id", userId);
  return NextResponse.json({ isAdmin: true, plan });
}
