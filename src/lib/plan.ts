import { supabaseAdmin } from "@/lib/supabase";
import type { PlanType } from "@/types";

/**
 * The current user's billing plan. Defaults to "free" if the row is missing (a user who hasn't
 * been synced/upserted yet is treated as free, never accidentally granted paid depth).
 */
export async function getUserPlan(clerkUserId: string): Promise<PlanType> {
  const { data } = await supabaseAdmin
    .from("users").select("plan").eq("clerk_id", clerkUserId).maybeSingle();
  const plan = data?.plan;
  return plan === "starter" || plan === "pro" ? plan : "free";
}

/**
 * How deep a product search goes for a plan — the cost + monetization gate. Product search is
 * the app's biggest per-action SerpApi cost, so free is deliberately cheap AND capped:
 *   - free: keyword-only (skip the extra Google Lens visual-match call) AND only ONE result is
 *     returned. So a free lookup is a single SerpApi search, and the UI shows that one match plus
 *     a generic "upgrade to see more" card (`locked`) — never fabricated extras.
 *   - starter/pro: the full Lens + keyword search, all results.
 * `locked` is a display signal only (there's more behind the paywall), derived from plan at
 * response time — it isn't persisted, so upgrading immediately ungates future reads.
 */
export interface SearchTier {
  useLens: boolean;
  limit: number;
  locked: boolean;
}

export function searchTierForPlan(plan: PlanType): SearchTier {
  if (plan === "free") return { useLens: false, limit: 1, locked: true };
  return { useLens: true, limit: 8, locked: false };
}
