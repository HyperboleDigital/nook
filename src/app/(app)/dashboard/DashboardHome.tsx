"use client";

import Link from "next/link";
import { Plus, Sofa, Sparkles, UploadCloud } from "lucide-react";

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
  reimagined: boolean;
};

// Fixed locale so server-render and client-hydration produce the same string (no mismatch).
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function DashboardHome({ projects }: { projects: DashboardProject[] }) {
  return (
    <div className="max-w-2xl mx-auto lg:mx-0">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your rooms</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Reimagine a space, then shop the look.</p>
        </div>
        {/* Desktop keeps a visible "new" entry (mobile has the tab-bar +). */}
        <Link href="/restyle/new"
          className="hidden lg:inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] text-[var(--background)] px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity shrink-0">
          <Plus className="h-4 w-4" /> New room
        </Link>
      </div>

      {projects.length === 0 ? (
        <Link href="/restyle/new"
          className="block rounded-3xl border-2 border-dashed border-[var(--border)] p-16 text-center hover:border-[var(--foreground)] transition-colors">
          <UploadCloud className="h-8 w-8 mx-auto mb-3 text-[var(--muted-foreground)]" strokeWidth={1.5} />
          <p className="text-sm text-[var(--muted-foreground)] mb-4">No rooms yet.</p>
          <span className="inline-block rounded-full bg-[var(--foreground)] text-white text-sm font-semibold px-5 py-2">
            Reimagine your first room →
          </span>
        </Link>
      ) : (
        <div className="space-y-4">
          {projects.map((p) => (
            <ProjectCard key={`${p.kind}-${p.id}`} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

// Big, full-bleed image card with everything overlaid on a bottom gradient — the room is the hero,
// title/date sit bottom-left, and a Draft / Reimagined status pill sits bottom-right.
function ProjectCard({ p }: { p: DashboardProject }) {
  return (
    <Link href={p.href}
      className="group relative block aspect-[16/10] rounded-3xl overflow-hidden bg-[var(--muted)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-pop)] transition-shadow">
      {p.thumb ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={p.thumb} alt={p.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--muted-foreground)]">
          <Sofa className="h-10 w-10" strokeWidth={1.5} />
        </div>
      )}

      {/* Bottom scrim so white text stays legible on any photo. */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate drop-shadow-sm">{p.title}</h3>
          <p className="text-xs text-white/75">{formatDate(p.date)}</p>
        </div>
        <StatusPill reimagined={p.reimagined} />
      </div>
    </Link>
  );
}

function StatusPill({ reimagined }: { reimagined: boolean }) {
  if (reimagined) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/95 text-[var(--accent)] text-[11px] font-semibold px-2.5 py-1 shadow-[var(--shadow-soft)]">
        <Sparkles className="h-3 w-3" /> Reimagined
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-black/45 text-white text-[11px] font-medium px-2.5 py-1 backdrop-blur-sm">
      Draft
    </span>
  );
}
