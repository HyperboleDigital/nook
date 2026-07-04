"use client";

import type { DetectedObject } from "@/types";

/**
 * Circular tap targets positioned from Gemini's box_2d (0–1000 scaled). Used over both the
 * original photo (real detected positions) and a render (swaps approximated by reusing the
 * matching item's original position; adds use a small box synthesized around their placed pin
 * — see useRestyleWorkspace's renderHotspots).
 *
 * A solid white backing disc sits under every marker regardless of state — without it a small
 * colored dot disappears against a busy or similarly-toned photo (this was reported as
 * invisible in testing at a smaller/lower-contrast size).
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
      {objects.map((o, i) => {
        const [ymin, xmin, ymax, xmax] = o.box_2d;
        const cx = (xmin + xmax) / 2 / 10; // percent
        const cy = (ymin + ymax) / 2 / 10;
        const isActive = activeLabel?.toLowerCase() === o.label.toLowerCase();
        const isStaged = stagedLabels.has(o.label.toLowerCase());
        return (
          <button
            key={`${o.label}-${i}`}
            type="button"
            onClick={() => onSelect(o.label, cx, cy)}
            aria-label={o.label}
            title={o.label}
            className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-11 w-11 group"
            style={{ left: `${cx}%`, top: `${cy}%` }}
          >
            {/* Pulsing halo — draws the eye to a detected item without needing a label */}
            <span
              className="absolute h-5 w-5 rounded-full bg-white/70 animate-[hotspot-pulse_2.4s_ease-out_infinite]"
              style={{ animationDelay: `${i * 150}ms` }}
            />
            {/* White backing disc — keeps the marker visible against any photo */}
            <span className="absolute h-5 w-5 rounded-full bg-white border border-[var(--border)] shadow-[var(--shadow-soft)] group-hover:border-[var(--accent)] transition-colors" />
            <span
              className={`relative h-2.5 w-2.5 rounded-full transition-colors ${
                isActive || isStaged ? "bg-[var(--accent)]" : "bg-[var(--foreground)] group-hover:bg-[var(--accent)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
