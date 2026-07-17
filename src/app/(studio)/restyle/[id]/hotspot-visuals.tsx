import { Eraser, ShoppingBag, Sparkles, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared between the studio's ObjectHotspots.tsx (editable, state-aware) and the public share
// page's ShareHotspots.tsx (read-only) so the two never visually drift apart — same geometry,
// same icon language, same region/marker look, just different interactivity on top.

// Two markers whose anchor points land within this many percentage points of each other read
// as one overlapping blob — nudge them apart (the markers are just the at-rest affordance; the
// tap target is the whole item box, so this is purely cosmetic).
const MIN_SEPARATION_PCT = 7;
const SEPARATION_ITERATIONS = 8;

// A box covering at least this fraction of the image is a "surface" item — a rug, a large
// sectional — that OTHER things sit on top of. Its bounding-box center is usually occluded
// (a rug's center is under the coffee table), so a plain center anchor lands the marker on the
// wrong object. Below this, the center is fine.
const SURFACE_AREA_FRAC = 0.16;

export type Box = { x0: number; y0: number; x1: number; y1: number; area: number };
export const toBox = (b: [number, number, number, number]): Box => {
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
export function anchorFor(box: Box, all: Box[]): { x: number; y: number } {
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
export function declutter(points: { x: number; y: number }[]): { x: number; y: number }[] {
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

export type ActionEditLike = { kind?: string | null; buy_url?: string | null } | null | undefined;

// Same icon language as SourcePanel's "Edit item" menu (MenuRow: Swap it=Sparkles, Shop similar
// items=ShoppingBag, Remove it=Eraser, Adjust it=Wand2) — a marker's icon tells you which of
// those actions produced it, so the canvas and the menu (and, now, the public share page) all
// read as the same vocabulary. Returns the icon element directly (not a component reference) —
// assigning a component reference to a variable and using it as a JSX tag trips the "no
// components created during render" lint rule, even though this just selects an existing one.
export function actionIcon(edit: ActionEditLike, className: string) {
  if (edit?.kind === "remove") return <Eraser className={className} strokeWidth={2.5} />;
  if (edit?.kind === "refine") return <Wand2 className={className} strokeWidth={2.5} />;
  // A real buyable product (buy_url) matches "Shop similar items"; anything else placed via a
  // swap/add — sourced from a plain description or inspo photo, nothing resolved yet — matches
  // "Swap it"'s sparkle instead, so it never implies something's purchasable when it isn't.
  return edit?.buy_url ? <ShoppingBag className={className} strokeWidth={2.5} /> : <Sparkles className={className} strokeWidth={2.5} />;
}

/** The whole-item highlighted region: an invisible tap target the size of the full box
 *  (forgiving of a slightly-off box) that outlines + fills accent-color with its label on
 *  hover/active. Shared visual between the editable and read-only hotspot overlays. */
export function HotspotRegion({
  box, label, isActive, onClick, ariaLabel,
}: { box: Box; label: string; isActive: boolean; onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={label}
      className={cn(
        "group absolute pointer-events-auto rounded-xl border-2 transition-colors",
        isActive
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-transparent hover:border-[var(--accent)] hover:bg-[var(--accent)]/10",
      )}
      style={{ left: `${box.x0}%`, top: `${box.y0}%`, width: `${box.x1 - box.x0}%`, height: `${box.y1 - box.y0}%` }}
    >
      <span
        className={cn(
          "absolute top-1 left-1 rounded-full bg-[var(--foreground)] text-white text-[10px] font-medium px-1.5 py-0.5 capitalize whitespace-nowrap shadow-[var(--shadow-soft)] transition-opacity",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** The small circular at-rest marker — a frosted, color-TINTED glass disc (the room shows faintly
 *  through it, with a bright rim catching light) plus an `actionIcon`. `bg` is a TRANSLUCENT tint
 *  (meaning varies by caller: state color in the studio, always "placed" green on the read-only
 *  share page) — pass it at partial opacity (e.g. `bg-amber-500/80`) so the glass reads. The icon
 *  itself is unchanged — this is a cosmetic glass treatment of the disc only. */
export function HotspotMarker({ bg, icon }: { bg: string; icon: React.ReactNode }) {
  return (
    <span className={cn(
      "relative h-6 w-6 rounded-full flex items-center justify-center backdrop-blur-md",
      "border border-white/70 ring-1 ring-inset ring-white/40 shadow-[var(--shadow-pop)]",
      bg,
    )}>
      {icon}
    </span>
  );
}
