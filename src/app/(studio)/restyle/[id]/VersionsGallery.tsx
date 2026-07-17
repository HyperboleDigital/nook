"use client";

import { Check } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { RestyleEdit, RestyleRender } from "@/types";
import { Modal } from "./ui";

// A browsable history of every combination the room has been generated as (each cached render is
// one). The images ARE the point — tap one to jump the room back to that version (restoreRender
// flips the edits to match and swaps to the cached image, no re-render). This is the "see what
// we've generated" view the per-item "tried before" strip was NOT — it's whole-room results, and
// it lives on its own (opened from the canvas), not buried in a sourcing panel.
export default function VersionsGallery({ ws, open, onClose }: { ws: RestyleWorkspace; open: boolean; onClose: () => void }) {
  const editsById = new Map(ws.edits.map((e) => [e.id, e] as const));
  // Most recent first. Each render's signature is the comma-joined active-edit ids it was built
  // from; turn that into a short human caption of what's in it.
  const renders = [...ws.renders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const caption = (r: RestyleRender): string => {
    const ids = r.signature.split(",").filter(Boolean);
    if (ids.length === 0) return "Empty room";
    const names = ids
      .map((id) => editsById.get(id))
      .filter((e): e is RestyleEdit => !!e && !!e.target_label)
      .map((e) => e.product_title ?? e.target_label!);
    if (names.length === 0) return `${ids.length} change${ids.length === 1 ? "" : "s"}`;
    const shown = names.slice(0, 2).join(", ");
    const extra = names.length - Math.min(2, names.length);
    return extra > 0 ? `${shown} +${extra}` : shown;
  };

  return (
    <Modal open={open} onClose={onClose} title="Versions" widthClassName="max-w-lg">
      {renders.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No versions yet — generate a design and it&apos;ll show up here.</p>
      ) : (
        <>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">Every design you&apos;ve generated. Tap one to bring it back.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {renders.map((r) => {
              const isCurrent = r.image_url === ws.displayUrl;
              return (
                <button key={r.id} type="button"
                  onClick={() => { ws.restoreRender(r); onClose(); }}
                  className="group text-left space-y-1.5">
                  <div className={cnBox(isCurrent)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.image_url} alt="" className="h-full w-full object-cover" />
                    {isCurrent && (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold px-2 py-0.5">
                        <Check className="h-3 w-3" /> Current
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] capitalize truncate px-0.5">{caption(r)}</p>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

function cnBox(isCurrent: boolean): string {
  return [
    "relative aspect-[4/3] rounded-xl overflow-hidden border bg-[var(--muted)] transition-shadow",
    isCurrent ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30" : "border-[var(--border)] group-hover:shadow-[var(--shadow-pop)]",
  ].join(" ");
}
