"use client";

import { useEffect, useState } from "react";
import { Switch } from "./ui";

// Admin-only control in the studio top bar: flip your OWN plan between free/pro to test the
// plan-gated product search (see /api/admin/plan + searchTierForPlan). Renders nothing for a
// non-admin, so it's invisible to real users. The gate is server-side per request, so after
// toggling, the NEXT search reflects the new tier (already-shown results don't retroactively
// change — re-open "Shop similar" to see the difference).
export default function AdminPlanToggle() {
  const [state, setState] = useState<{ isAdmin: boolean; plan: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setState(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!state?.isAdmin) return null;
  const isPro = state.plan !== "free";

  const toggle = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: isPro ? "free" : "pro" }),
      });
      if (r.ok) setState(await r.json());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)] px-2.5 py-1 shrink-0"
      title="Admin only — toggle your plan to test free vs pro gating">
      <span className="text-[11px] font-semibold text-[var(--muted-foreground)]">
        {isPro ? "Pro" : "Free"}
      </span>
      <Switch checked={isPro} disabled={busy} onChange={toggle} aria-label="Toggle test plan" />
    </div>
  );
}
