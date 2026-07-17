"use client";

import { use } from "react";
import { useRestyleWorkspace } from "./useRestyleWorkspace";
import RestyleStudio from "./RestyleStudio";
import { Spinner } from "./ui";

// The immersive editor shell: the studio fills the whole viewport edge-to-edge — see
// (studio)/layout.tsx for why this route has no app sidebar. The back button + editable room
// title used to live in a slim white top bar here; they now float on the photo as glass chrome
// (see RestyleCanvas), so there's no chrome bar breaking the immersive full-bleed image.
export default function RestylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useRestyleWorkspace(id);

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
    <div className="h-dvh">
      <RestyleStudio ws={ws} />
    </div>
  );
}
