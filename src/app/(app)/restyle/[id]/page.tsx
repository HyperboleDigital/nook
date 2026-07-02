"use client";

import { use } from "react";
import Link from "next/link";
import { useRestyleWorkspace } from "./useRestyleWorkspace";
import RestyleStudio from "./RestyleStudio";
import { Spinner } from "./ui";

export default function RestylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useRestyleWorkspace(id);

  if (ws.loading || !ws.restyle) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-[var(--muted-foreground)]">
          <Spinner size="lg" />
          <span className="text-sm">Setting up your room…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-3 mb-4 px-3 md:px-0">
        <div className="min-w-0">
          <Link href="/restyle" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            ← All restyles
          </Link>
          <input
            value={ws.titleDraft}
            onChange={(e) => ws.setTitleDraft(e.target.value)}
            onBlur={() => ws.saveTitle(ws.titleDraft)}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Untitled Room"
            className="block w-full bg-transparent text-xl font-bold tracking-tight -tracking-[0.02em] focus:outline-none focus:underline placeholder:text-[var(--muted-foreground)] mt-0.5"
          />
        </div>
      </div>

      <RestyleStudio ws={ws} />
    </div>
  );
}
