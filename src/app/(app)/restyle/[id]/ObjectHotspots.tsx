"use client";

import type { DetectedObject } from "@/types";

/**
 * Small circular tap targets positioned from Gemini's box_2d (0–1000 scaled). Used over both
 * the original photo (real detected positions) and a render (approximated by reusing the
 * matching item's original position — swapped furniture usually stays roughly where the
 * original piece was; "added" items have no known position and don't get a hotspot here).
 */
export default function ObjectHotspots({
  objects, activeLabel, stagedLabels, onSelect,
}: {
  objects: DetectedObject[];
  activeLabel?: string;
  stagedLabels: Set<string>;
  onSelect: (label: string, cx: number, cy: number) => void;
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
            onClick={() => onSelect(o.label, cx, cy)}
            aria-label={o.label}
            title={o.label}
            className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-9 w-9 group"
            style={{ left: `${cx}%`, top: `${cy}%` }}
          >
            {(isActive || isStaged) && (
              <span className={`absolute h-5 w-5 rounded-full ${isActive ? "bg-[var(--primary)]/25" : "bg-[var(--primary)]/15"}`} />
            )}
            <span
              className={`relative h-2.5 w-2.5 rounded-full border-2 border-white transition-colors ${
                isActive ? "bg-[var(--primary)]"
                : isStaged ? "bg-[var(--primary)]/80"
                : "bg-[var(--foreground)]/70 group-hover:bg-[var(--primary)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
