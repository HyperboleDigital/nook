"use client";

import { Fragment } from "react";
import { Check, Loader2, ShoppingBag, Sparkles } from "lucide-react";
import type { CanvasHotspot } from "./useRestyleWorkspace";
import { cn } from "@/lib/utils";

// Two markers whose anchor points land within this many percentage points of each other read
// as one overlapping blob — nudge them apart (the markers are just the at-rest affordance; the
// tap target is the whole item box, so this is purely cosmetic now).
const MIN_SEPARATION_PCT = 7;
const SEPARATION_ITERATIONS = 8;

// A box covering at least this fraction of the image is a "surface" item — a rug, a large
// sectional — that OTHER things sit on top of. Its bounding-box center is usually occluded
// (a rug's center is under the coffee table), so a plain center anchor lands the marker on the
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
 * Where to drop the small at-rest marker for a box. For a compact item it's the center. For a
 * SURFACE item (a rug/large sofa — see SURFACE_AREA_FRAC) the center tends to sit under whatever
 * is on top of it, so sample a grid inside the box and pick the point closest to center that
 * ISN'T covered by any SMALLER box (things sitting on the surface are smaller than it). Only
 * smaller boxes count as occluders, so a sofa still marks ON the sofa even though its box
 * overlaps the (larger) rug beneath it. Falls back to the center if the whole surface is covered.
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

/** Pairwise repulsion pass: any two points closer than MIN_SEPARATION_PCT push apart. */
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

/** The small at-rest marker per state, so the canvas shows WHERE items are without 14 always-on
 *  boxes cluttering it. The full-item highlight (below) is the forgiving tap target + hover cue. */
function StateMarker({
  state, delay, isActive, shoppable,
}: { state: CanvasHotspot["state"]; delay: number; isActive: boolean; shoppable: boolean }) {
  if (state === "confirming") {
    return (
      <span className="relative h-6 w-6 rounded-full bg-[var(--muted-foreground)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
        <Loader2 className="h-3.5 w-3.5 text-white animate-spin" strokeWidth={3} />
      </span>
    );
  }
  if (state === "queued") {
    return (
      <span className="relative h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (state === "placed") {
    // A shopping bag implies "this is a real, buyable product" — true for a genuine swap/pick
    // with a buy_url, but NOT for an add/swap sourced from a plain description or inspo photo
    // with nothing shoppable resolved yet. Those get a "new" sparkle instead, so the marker
    // never claims something's purchasable when it isn't.
    return (
      <span className="relative h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
        {shoppable
          ? <ShoppingBag className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          : <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />}
      </span>
    );
  }
  return (
    <span className="relative flex items-center justify-center h-5 w-5">
      {/* Pulsing halo — draws the eye without a permanent label */}
      <span className="absolute h-5 w-5 rounded-full bg-white/70 animate-[hotspot-pulse_2.4s_ease-out_infinite]" style={{ animationDelay: `${delay}ms` }} />
      <span className="absolute h-5 w-5 rounded-full bg-white border border-[var(--border)] shadow-[var(--shadow-soft)]" />
      <span className={cn("relative h-2.5 w-2.5 rounded-full", isActive ? "bg-[var(--accent)]" : "bg-[var(--foreground)]")} />
    </span>
  );
}

/**
 * Detected-item overlay. Each item is a HIGHLIGHTED REGION, not a single dot: the whole item's
 * box is an invisible tap target (forgiving of a slightly-off box — a wrong dot used to be
 * glaring; a loose region still clearly means "the couch"), and on hover / when active it
 * outlines + fills in the accent color with its label. A small state marker sits at the item's
 * anchor so the canvas shows where items are at rest without a grid of boxes. Regions render
 * largest-first so a small item (a pillow) stacks ABOVE the large one it sits on (the sofa/rug)
 * and stays individually tappable. See useRestyleWorkspace's `canvasHotspots` for how each item's
 * state (idle/confirming/queued/placed) is derived; `box_2d` comes from detection (now on a
 * stronger Gemini tier — see gemini.ts GEMINI_DETECT_MODEL).
 */
export default function ObjectHotspots({
  hotspots, activeLabel, onSelect,
}: {
  hotspots: CanvasHotspot[];
  activeLabel?: string;
  onSelect: (hotspot: CanvasHotspot, cx: number, cy: number) => void;
}) {
  const boxes = hotspots.map((h) => toBox(h.box_2d));
  const markers = declutter(boxes.map((b) => anchorFor(b, boxes)));
  // Largest-area first → smallest painted last → smallest on top for both stacking and taps.
  const order = hotspots.map((_, i) => i).sort((a, b) => boxes[b].area - boxes[a].area);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {order.map((i) => {
        const h = hotspots[i];
        const b = boxes[i];
        const m = markers[i];
        const isActive = activeLabel?.toLowerCase() === h.label.toLowerCase();
        const ariaLabel =
          h.state === "confirming" ? `${h.label} (confirming…)`
          : h.state === "queued" ? `${h.label} (queued for a change)`
          : h.state === "placed" ? `${h.label} (${h.edit?.buy_url ? "shop this" : "added"})`
          : h.label;
        return (
          <Fragment key={`${h.label}-${i}`}>
            {/* Whole-item tap target + hover/active highlight (`group` scopes the label reveal) */}
            <button
              type="button"
              onClick={() => onSelect(h, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)}
              aria-label={ariaLabel}
              title={h.label}
              className={cn(
                "group absolute pointer-events-auto rounded-xl border-2 transition-colors",
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-transparent hover:border-[var(--accent)] hover:bg-[var(--accent)]/10",
              )}
              style={{ left: `${b.x0}%`, top: `${b.y0}%`, width: `${b.x1 - b.x0}%`, height: `${b.y1 - b.y0}%` }}
            >
              <span
                className={cn(
                  "absolute top-1 left-1 rounded-full bg-[var(--foreground)] text-white text-[10px] font-medium px-1.5 py-0.5 capitalize whitespace-nowrap shadow-[var(--shadow-soft)] transition-opacity",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                {h.label}
              </span>
            </button>
            {/* At-rest state marker (decorative — pointer-events-none so it never blocks a tap) */}
            <span
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
            >
              <StateMarker state={h.state} delay={i * 150} isActive={isActive} shoppable={!!h.edit?.buy_url} />
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
