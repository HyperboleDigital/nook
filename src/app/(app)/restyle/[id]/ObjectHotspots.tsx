"use client";

import { Check, ShoppingBag } from "lucide-react";
import type { CanvasHotspot } from "./useRestyleWorkspace";

// Two hotspots whose detected centers land within this many percentage points of each
// other read as one overlapping blob and are hard to tap individually — nudge them apart.
const MIN_SEPARATION_PCT = 7;
const SEPARATION_ITERATIONS = 8;

/** Pairwise repulsion pass: any two points closer than MIN_SEPARATION_PCT push apart along
 *  the line between them, clamped to stay on-canvas. Cheap for the handful of hotspots a
 *  room ever has, so a fixed iteration count is plenty to settle. */
function declutter(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const pts = points.map((p) => ({ ...p }));
  for (let iter = 0; iter < SEPARATION_ITERATIONS; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= MIN_SEPARATION_PCT) continue;
        const push = (MIN_SEPARATION_PCT - dist) / 2;
        const ux = dx / dist, uy = dy / dist;
        pts[i].x -= ux * push; pts[i].y -= uy * push;
        pts[j].x += ux * push; pts[j].y += uy * push;
      }
    }
  }
  return pts.map((p) => ({ x: Math.min(97, Math.max(3, p.x)), y: Math.min(97, Math.max(3, p.y)) }));
}

/**
 * Circular tap targets for whichever image is on screen — see useRestyleWorkspace's
 * `canvasHotspots` for how each one's state (idle/queued/placed) is derived. Positions are
 * decluttered as a set (see `declutter` above) so two items detected close together — e.g. a
 * vase sitting on a coffee table — don't render as one unreachable overlapping blob.
 *
 * A solid white backing disc sits under every idle marker regardless of hover state —
 * without it a small colored dot disappears against a busy or similarly-toned photo (this
 * was reported as invisible in testing at a smaller/lower-contrast size).
 */
export default function ObjectHotspots({
  hotspots, activeLabel, onSelect,
}: {
  hotspots: CanvasHotspot[];
  activeLabel?: string;
  onSelect: (hotspot: CanvasHotspot, cx: number, cy: number) => void;
}) {
  const rawCenters = hotspots.map((h) => {
    const [ymin, xmin, ymax, xmax] = h.box_2d;
    return { x: (xmin + xmax) / 2 / 10, y: (ymin + ymax) / 2 / 10 };
  });
  const centers = declutter(rawCenters);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {hotspots.map((h, i) => {
        const { x: cx, y: cy } = centers[i];
        const isActive = activeLabel?.toLowerCase() === h.label.toLowerCase();
        return (
          <button
            key={`${h.label}-${i}`}
            type="button"
            onClick={() => onSelect(h, cx, cy)}
            aria-label={
              h.state === "queued" ? `${h.label} (queued for a change)`
              : h.state === "placed" ? `${h.label} (shop this)`
              : h.label
            }
            title={h.label}
            className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-11 w-11 group"
            style={{ left: `${cx}%`, top: `${cy}%` }}
          >
            {h.state === "queued" ? (
              // Staged, but not in the image on screen yet — a filled green disc with a
              // checkmark, clearly distinct from a plain "tap me" marker. No pulse: this
              // one's already handled, just not rendered yet.
              <span className="relative h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
              </span>
            ) : h.state === "placed" ? (
              // This change IS in the image on screen — same green disc, a bag icon instead
              // of a checkmark to read as "a product lives here" rather than "pending."
              <span className="relative h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
                <ShoppingBag className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </span>
            ) : (
              <>
                {/* Pulsing halo — draws the eye to a not-yet-changed item without needing a label */}
                <span
                  className="absolute h-5 w-5 rounded-full bg-white/70 animate-[hotspot-pulse_2.4s_ease-out_infinite]"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
                {/* White backing disc — keeps the marker visible against any photo */}
                <span className="absolute h-5 w-5 rounded-full bg-white border border-[var(--border)] shadow-[var(--shadow-soft)] group-hover:border-[var(--accent)] transition-colors" />
                <span
                  className={`relative h-2.5 w-2.5 rounded-full transition-colors ${
                    isActive ? "bg-[var(--accent)]" : "bg-[var(--foreground)] group-hover:bg-[var(--accent)]"
                  }`}
                />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
