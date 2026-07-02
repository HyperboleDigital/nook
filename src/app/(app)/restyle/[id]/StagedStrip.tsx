"use client";

import { X, Plus, Replace } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";

/** Compact horizontal strip of staged changes — tap reopens sourcing for that item. */
export default function StagedStrip({ ws }: { ws: RestyleWorkspace }) {
  if (ws.stagedItems.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {ws.stagedItems.map((e) => {
        const label = e.target_label ?? "";
        const isOptimistic = e.id.startsWith("optimistic-");
        return (
          <div key={e.id}
            className="shrink-0 flex items-center gap-2 border border-[var(--border)] bg-white pl-1.5 pr-2 py-1.5 cursor-pointer hover:border-[var(--foreground)] transition-colors"
            onClick={() => ws.openSourcing(label, e.kind === "add" ? "add" : "swap")}>
            {e.reference_url
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.reference_url} alt="" className="h-8 w-8 object-cover border border-[var(--border)]" />
              : <span className="h-8 w-8 bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)]">
                  {e.kind === "add" ? <Plus className="h-3.5 w-3.5" /> : <Replace className="h-3.5 w-3.5" />}
                </span>}
            <span className="text-xs font-medium capitalize max-w-[8rem] truncate">{e.product_title ?? label}</span>
            {!isOptimistic && (
              <button type="button" onClick={(ev) => { ev.stopPropagation(); ws.remove(e.id); }}
                aria-label="Remove" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
