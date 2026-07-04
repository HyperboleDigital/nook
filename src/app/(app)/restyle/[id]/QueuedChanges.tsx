"use client";

import { MapPin, Plus, Replace, X } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { IconButton } from "./ui";

/**
 * Pending swaps/adds not reflected in the currently-displayed photo yet — shown in the right
 * rail while viewing the original (nothing's been generated to show them in yet). Deliberately
 * framed as "queued", not "placed": ShopLook is the source of truth for what's actually IN the
 * current image once a render exists; this is what WILL be in it after the next generate.
 */
export default function QueuedChanges({ ws }: { ws: RestyleWorkspace }) {
  if (ws.stagedItems.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        Nothing queued yet — tap an item to swap it, or add something new.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Queued changes</p>
        <p className="text-[11px] text-[var(--muted-foreground)]">Not in the photo yet — generate to see these in your room.</p>
      </div>
      <div className="space-y-2">
        {ws.stagedItems.map((e) => {
          const label = e.target_label ?? "item";
          const isOptimistic = e.id.startsWith("optimistic-");
          return (
            <div key={e.id}
              className="flex items-center gap-3 p-2.5 rounded-2xl border border-[var(--border)] bg-white cursor-pointer hover:border-[var(--foreground)] transition-colors"
              onClick={() => ws.openSimilar(label, e.kind === "add" ? "add" : "swap", e.id)}>
              {e.reference_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.reference_url} alt="" className="h-12 w-12 object-cover rounded-xl border border-[var(--border)] shrink-0" />
              ) : (
                <span className="h-12 w-12 rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0 flex items-center justify-center text-[var(--muted-foreground)]">
                  {e.kind === "add" ? <Plus className="h-4 w-4" /> : <Replace className="h-4 w-4" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium capitalize truncate">{e.product_title ?? label}</p>
                <p className="text-[11px] text-[var(--muted-foreground)] capitalize">
                  {e.kind === "add" ? "Adding" : "Swapping"}{label ? ` · ${label}` : ""}
                  {e.product_price ? ` · ${e.product_price}` : ""}
                </p>
                {e.kind === "add" && (
                  <button type="button"
                    onClick={(ev) => { ev.stopPropagation(); ws.requestPin(e.id, label); }}
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {e.placement
                      ? <>Pinned{e.placement.note ? <span className="truncate max-w-[10rem]"> — &quot;{e.placement.note}&quot;</span> : null} · <span className="underline">Move</span></>
                      : "Choose a spot"}
                  </button>
                )}
              </div>
              {!isOptimistic && (
                <IconButton aria-label="Remove" className="h-7 w-7 shrink-0"
                  onClick={(ev) => { ev.stopPropagation(); ws.remove(e.id); }}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
