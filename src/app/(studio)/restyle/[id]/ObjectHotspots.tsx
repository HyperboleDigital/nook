"use client";

import { Check, Loader2, ShoppingBag } from "lucide-react";
import type { CanvasHotspot } from "./useRestyleWorkspace";

// Two hotspots whose detected centers land within this many percentage points of each
// other read as one overlapping blob and are hard to tap individually — nudge them apart.
const MIN_SEPARATION_PCT = 7;
const SEPARATION_ITERATIONS = 8;

// A box covering at least this fraction of the image is a "surface" item — a rug, a large
// sectional — that OTHER things sit on top of. Its bounding-box center is usually occluded
// (a rug's center is under the coffee table), so a plain center anchor lands the pin on the
// wrong object. Below this, the center is fine.
const SURFACE_AREA_FRAC = 0.16;

type Box = { x0: number; y0: number; x1: number; y1: number; area: number };
const toBox = (b: [number, number, number, number]): Box => {
  const [ymin, xmin, ymax, xmax] = b;
  const x0 = xmin / 10, y0 = ymin / 10, x1 = xmax / 10, y1 = ymax / 10; // → 0–100
  return { x0, y0, x1, y1, area: (Math.max(0, x1 - x0) * Math.max(0, y1 - y0)) / 1e4 };
};
const inside = (px: number, py: number, b: Box) => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1;

/**
 * Where to actually drop the pin for a box. For a compact item it's just the center. For a
 * SURFACE item (a rug/large sofa — see SURFACE_AREA_FRAC) the center tends to sit under
 * whatever's on top of it, so instead sample a grid inside the box and pick the point closest
 * to the box center that ISN'T covered by any SMALLER box (things sitting on the surface are
 * smaller than it). Only smaller boxes count as occluders, so a sofa still anchors ON the sofa
 * even though its box overlaps the (larger) rug beneath it. Falls back to the center if the
 * whole surface is covered.
 */
function anchorFor(box: Box, all: Box[]): { x: number; y: number } {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  if (box.area < SURFACE_AREA_FRAC) return { x: cx, y: cy };
  const occluders = all.filter((o) => o !== box && o.area < box.area);
  const inset = 0.14;
  const bx0 = box.x0 + (box.x1 - box.x0) * inset, bx1 = box.x1 - (box.x1 - box.x0) * inset;
  const by0 = box.y0 + (box.y1 - box.y0) * inset, by1 = box.y1 - (box.y1 - box.y0) * inset;
  let best: { x: number; y: number; d: number } | null = null;
  const N = 8;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const px = bx0 + ((bx1 - bx0) * i) / N;
      const py = by0 + ((by1 - by0) * j) / N;
      if (occluders.some((o) => inside(px, py, o))) continue;
      const d = Math.hypot(px - cx, py - cy);
      if (!best || d < best.d) best = { x: px, y: py, d };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: cx, y: cy };
}

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
  const boxes = hotspots.map((h) => toBox(h.box_2d));
  const rawCenters = boxes.map((b) => anchorFor(b, boxes));
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
              h.state === "confirming" ? `${h.label} (confirming…)`
              : h.state === "queued" ? `${h.label} (queued for a change)`
              : h.state === "placed" ? `${h.label} (shop this)`
              : h.label
            }
            title={h.label}
            className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-11 w-11 group"
            style={{ left: `${cx}%`, top: `${cy}%` }}
          >
            {h.state === "confirming" ? (
              // Still round-tripping to the server (product lookup in flight) — a distinct
              // muted/spinner marker so it never reads as "done" like the queued checkmark.
              <span className="relative h-6 w-6 rounded-full bg-[var(--muted-foreground)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
                <Loader2 className="h-3.5 w-3.5 text-white animate-spin" strokeWidth={3} />
              </span>
            ) : h.state === "queued" ? (
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
