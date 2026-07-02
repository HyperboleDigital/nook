"use client";

import type { DetectedObject } from "@/types";

/**
 * Tap targets positioned from Gemini's box_2d (0–1000 scaled) over the ORIGINAL room photo
 * only — the boxes are detected against that image and don't map onto a re-rendered one, so
 * this is never shown when the canvas is displaying a render (ChipRow is the entry point then).
 */
export default function ObjectHotspots({
  objects, activeLabel, stagedLabels, onSelect,
}: {
  objects: DetectedObject[];
  activeLabel?: string;
  stagedLabels: Set<string>;
  onSelect: (label: string) => void;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {objects.map((o) => {
        const [ymin, xmin, ymax, xmax] = o.box_2d;
        const cx = (xmin + xmax) / 2 / 10; // percent
        const cy = (ymin + ymax) / 2 / 10;
        const isActive = activeLabel?.toLowerCase() === o.label.toLowerCase();
        const isStaged = stagedLabels.has(o.label.toLowerCase());
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onSelect(o.label)}
            aria-label={o.label}
            title={o.label}
            className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-11 w-11 group"
            style={{ left: `${cx}%`, top: `${cy}%` }}
          >
            <span
              className={`h-6 w-6 border-2 transition-colors ${
                isActive ? "bg-[var(--primary)] border-[var(--primary)]"
                : isStaged ? "bg-white border-[var(--primary)]"
                : "bg-white/80 border-[var(--foreground)] group-hover:bg-[var(--foreground)] group-hover:border-[var(--foreground)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
