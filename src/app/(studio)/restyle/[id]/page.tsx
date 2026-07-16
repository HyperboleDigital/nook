"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useRestyleWorkspace } from "./useRestyleWorkspace";
import RestyleStudio from "./RestyleStudio";
import AdminPlanToggle from "./AdminPlanToggle";
import { IconButton, Spinner } from "./ui";

// The immersive editor shell: a slim top bar (back / title) + the studio filling the rest of
// the viewport edge-to-edge — see (studio)/layout.tsx for why this route has no app sidebar.
export default function RestylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useRestyleWorkspace(id);
  const router = useRouter();

  // Gate the full-page spinner on the project itself, not on detection finishing too — the room
  // photo + editor shell can render immediately once the project loads, with a small pill (see
  // RestyleStudio) covering the brief window before detected items/hotspots are ready.
  if (!ws.restyle) {
    return (
      <div className="h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--muted-foreground)]">
          <Spinner size="lg" />
          <span className="text-sm">Setting up your room…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 border-b border-[var(--border)] bg-[var(--card)]">
        <IconButton onClick={() => router.push("/restyle")} aria-label="All restyles">
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <input
          value={ws.titleDraft}
          onChange={(e) => ws.setTitleDraft(e.target.value)}
          onBlur={() => ws.saveTitle(ws.titleDraft)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="Untitled Room"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold tracking-[-0.02em] focus:outline-none focus:underline placeholder:text-[var(--muted-foreground)] placeholder:font-normal"
        />
        <AdminPlanToggle />
      </header>
      <div className="flex-1 min-h-0">
        <RestyleStudio ws={ws} />
      </div>
    </div>
  );
}
