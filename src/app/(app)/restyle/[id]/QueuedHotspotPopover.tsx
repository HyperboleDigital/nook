"use client";

import { X, Replace, Plus, Trash2 } from "lucide-react";
import type { RestyleEdit } from "@/types";
import { Button, IconButton } from "./ui";

/**
 * Small teaser anchored to a queued hotspot on the ORIGINAL photo — shows what's about to go
 * there so the user can see their pending change without opening the full sourcing panel.
 * Deliberately framed as "Queued · not in the photo yet" (never "placed"/priced): on the
 * original nothing is actually rendered yet, and implying otherwise reads as the app lying
 * about the room (see the CLAUDE.md "placed UI on the original" gotcha). The placed popover
 * with price/Buy is HotspotPopover, shown only on a render.
 */
export default function QueuedHotspotPopover({
  edit, label, cx, cy, onChange, onRemove, onClose,
}: {
  edit: RestyleEdit;
  label: string;
  cx: number;
  cy: number;
  onChange: () => void;
  onRemove?: () => void; // omitted while the edit is still optimistic (no server id yet)
  onClose: () => void;
}) {
  const isAdd = edit.kind === "add";
  const below = cy <= 50;
  return (
    <div
      className="absolute z-10 w-64 max-w-[80vw] rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]"
      style={{
        left: `${Math.min(Math.max(cx, 18), 82)}%`,
        top: below ? `${Math.min(cy + 5, 90)}%` : undefined,
        bottom: below ? undefined : `${Math.min(100 - cy + 5, 90)}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex items-start gap-3 p-3 pb-2">
        {edit.reference_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={edit.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-[var(--border)] shrink-0" />
        ) : (
          <span className="h-14 w-14 rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0 flex items-center justify-center text-[var(--muted-foreground)]">
            {isAdd ? <Plus className="h-4 w-4" /> : <Replace className="h-4 w-4" />}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <span className="inline-block rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] text-[10px] font-medium uppercase tracking-wide px-2 py-0.5">
            Queued
          </span>
          <p className="text-sm font-semibold capitalize leading-snug">{edit.product_title ?? label}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {isAdd ? "Adding" : "Swapping"} · not in the photo yet
          </p>
        </div>
        <IconButton onClick={onClose} aria-label="Close" className="h-6 w-6 shrink-0 -mt-1 -mr-1">
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="flex gap-2 p-3 pt-0">
        <Button size="sm" variant="accentSoft" className="flex-1" onClick={onChange}>
          <Replace className="h-3.5 w-3.5" /> Change
        </Button>
        {onRemove && (
          <Button size="sm" variant="subtle" onClick={onRemove} aria-label="Remove this change">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
}
