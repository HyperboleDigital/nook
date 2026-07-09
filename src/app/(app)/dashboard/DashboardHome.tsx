"use client";

import Link from "next/link";
import { ArrowUpRight, Plus, Sofa, UploadCloud } from "lucide-react";

// Tours isn't shipping in the MVP and its old test project cards were cluttering the dashboard —
// dashboard/page.tsx no longer fetches or passes any "tour" projects, so `kind` only ever carries
// "restyle" now (the /tours/[id] route itself is untouched, still reachable directly — see
// CLAUDE.md — it's just no longer surfaced here). Reels was fully sunset — no "reel" kind ever
// existed here.
export type DashboardProject = {
  kind: "restyle";
  id: string;
  title: string;
  href: string;
  thumb: string | null;
  date: string;
};

export default function DashboardHome({ projects }: { projects: DashboardProject[] }) {
  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Design your space.</h1>
        <p className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--muted-foreground)]">See it before you buy.</p>
      </div>

      {/* Quick actions — the single "start a new restyle" entry point on this page. Mobile also
          has the tab bar's camera button; this one still matters there too since it opens the
          full wizard (tips, room-type picker) rather than jumping straight to a photo prompt. */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link href="/restyle/new" className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium hover:border-[var(--foreground)] transition-colors inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Restyle
        </Link>
      </div>

      {/* Recent projects */}
      <div>
        <h2 className="font-semibold mb-4">Recent projects</h2>
        {projects.length === 0 ? (
          <Link href="/restyle/new" className="block rounded-3xl border-2 border-dashed border-[var(--border)] p-16 text-center hover:border-[var(--foreground)] transition-colors">
            <UploadCloud className="h-8 w-8 mx-auto mb-3 text-[var(--muted-foreground)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--muted-foreground)] mb-4">No projects yet.</p>
            <span className="inline-block rounded-full bg-[var(--foreground)] text-white text-sm font-semibold px-5 py-2">
              Start your first restyle →
            </span>
          </Link>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Link key={`${p.kind}-${p.id}`} href={p.href}
                className="group rounded-3xl overflow-hidden bg-[var(--card)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-pop)] transition-shadow">
                <div className="relative aspect-[4/3] bg-[var(--muted)]">
                  {p.thumb ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={p.thumb} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[var(--muted-foreground)]">
                      <Sofa className="h-8 w-8" strokeWidth={1.5} />
                    </div>
                  )}
                  <span className="absolute top-2 right-2 h-9 w-9 rounded-full bg-white/90 shadow-[var(--shadow-soft)] flex items-center justify-center">
                    <ArrowUpRight className="h-4 w-4 text-[var(--foreground)]" />
                  </span>
                </div>
                <div className="p-3 space-y-1">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {new Date(p.date).toLocaleDateString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
