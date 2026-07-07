"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Rotate3d, Search, Sofa, Sparkles, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardProject = {
  kind: "restyle" | "tour";
  id: string;
  title: string;
  href: string;
  thumb: string | null;
  date: string;
  status?: string;
};

// Tours isn't shipping in the MVP — its filter pill and quick-action link were removed below
// (nav-visibility only; see the layout.tsx NAV comment). KIND_ICON still maps "tour" since any
// pre-existing tour project still needs an icon to render in the list below. Reels was fully
// sunset (app code deleted entirely, see layout.tsx's NAV comment) — no "reel" kind exists anymore.
const FILTERS: { value: "all" | DashboardProject["kind"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "restyle", label: "Restyles" },
];

const KIND_ICON: Record<DashboardProject["kind"], typeof Sofa> = {
  restyle: Sofa,
  tour: Rotate3d,
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  complete: "bg-green-50 text-green-700 border-green-200",
  failed: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", STATUS_STYLES[status] ?? "bg-gray-50 text-gray-700 border-gray-200")}>
      {status}
    </span>
  );
}

export default function DashboardHome({ projects }: { projects: DashboardProject[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | DashboardProject["kind"]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter !== "all" && p.kind !== filter) return false;
      if (q && !p.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, query, filter]);

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Design your space.</h1>
        <p className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--muted-foreground)]">See it before you buy.</p>
      </div>

      {/* Search + AI entry point */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-[var(--shadow-soft)] px-5 h-12">
          <Search className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your projects"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-[var(--muted-foreground)]"
          />
        </div>
        <Link href="/restyle/new" aria-label="New restyle"
          className="h-12 w-12 shrink-0 rounded-full bg-[var(--foreground)] text-white flex items-center justify-center shadow-[var(--shadow-soft)] hover:opacity-90 transition-opacity">
          <Sparkles className="h-5 w-5" />
        </Link>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors",
              filter === f.value
                ? "bg-[var(--foreground)] text-white border-[var(--foreground)]"
                : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link href="/restyle/new" className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium hover:border-[var(--foreground)] transition-colors inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Restyle
        </Link>
      </div>

      {/* Recent projects */}
      <div>
        <h2 className="font-semibold mb-4">Recent projects</h2>
        {filtered.length === 0 ? (
          <Link href="/restyle/new" className="block rounded-3xl border-2 border-dashed border-[var(--border)] p-16 text-center hover:border-[var(--foreground)] transition-colors">
            <UploadCloud className="h-8 w-8 mx-auto mb-3 text-[var(--muted-foreground)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              {projects.length === 0 ? "No projects yet." : "No projects match your search."}
            </p>
            <span className="inline-block rounded-full bg-[var(--foreground)] text-white text-sm font-semibold px-5 py-2">
              Start your first restyle →
            </span>
          </Link>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const Icon = KIND_ICON[p.kind];
              return (
                <Link key={`${p.kind}-${p.id}`} href={p.href}
                  className="group rounded-3xl overflow-hidden bg-[var(--card)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-pop)] transition-shadow">
                  <div className="relative aspect-[4/3] bg-[var(--muted)]">
                    {p.thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={p.thumb} alt={p.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[var(--muted-foreground)]">
                        <Icon className="h-8 w-8" strokeWidth={1.5} />
                      </div>
                    )}
                    <span className="absolute top-2 right-2 h-9 w-9 rounded-full bg-white/90 shadow-[var(--shadow-soft)] flex items-center justify-center">
                      <ArrowUpRight className="h-4 w-4 text-[var(--foreground)]" />
                    </span>
                  </div>
                  <div className="p-3 space-y-1">
                    <div className="text-sm font-medium truncate">{p.title}</div>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] capitalize">
                      {p.kind} · {new Date(p.date).toLocaleDateString()}
                      {p.status && <StatusBadge status={p.status} />}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
