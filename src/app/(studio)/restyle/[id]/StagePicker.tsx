"use client";

import { Modal, StatusBanner } from "./ui";
import { RESTYLE_THEMES, type RestyleThemeKey } from "@/lib/restyle-themes";

/**
 * Style grid for "Stage this room" (GenerateBar's ⋯ menu) — a curated set of interior-design
 * styles, not free text, so the AI has a well-tested prompt to work from for each one (see
 * restyle-themes.ts). The warning banner IS the confirmation step (no stacked window.confirm —
 * picking a style already requires a deliberate extra click into this modal first).
 */
export default function StagePicker({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (theme: RestyleThemeKey) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Stage this room" widthClassName="max-w-2xl">
      <div className="space-y-3">
        <StatusBanner variant="warning">
          This clears all current furniture and any changes you&apos;ve staged, then furnishes
          the room fresh in the style you pick.
        </StatusBanner>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.values(RESTYLE_THEMES).map((t) => (
            <button key={t.key} type="button" onClick={() => onPick(t.key)}
              className="text-left rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 hover:border-[var(--foreground)] hover:shadow-[var(--shadow-soft)] transition-all">
              <p className="text-sm font-semibold">{t.label}</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5 line-clamp-2">{t.blurb}</p>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
