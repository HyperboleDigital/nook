"use client";

import { Fragment } from "react";
import { Loader2 } from "lucide-react";
import type { CanvasHotspot } from "./useRestyleWorkspace";
import { actionIcon, anchorFor, declutter, HotspotLabel, HotspotMarker, HotspotRegion, toBox } from "./hotspot-visuals";

/** The small at-rest marker per state, so the canvas shows WHERE items are without 14 always-on
 *  boxes cluttering it. The full-item highlight (below) is the forgiving tap target + hover cue. */
function StateMarker({
  state, delay, edit,
}: { state: CanvasHotspot["state"]; delay: number; edit: CanvasHotspot["edit"] }) {
  // Tints are TRANSLUCENT so the disc reads as frosted glass (see HotspotMarker) — the color still
  // carries the same meaning, just as a tinted glass instead of a solid fill.
  if (state === "confirming") {
    return <HotspotMarker bg="bg-black/35" icon={<Loader2 className="h-3.5 w-3.5 text-white animate-spin" strokeWidth={3} />} />;
  }
  if (state === "queued") {
    // Amber, not accent-green — matches ChangesPanel's "Pending — generate to apply" chip color,
    // so "queued" reads as the same not-yet-real status everywhere, while the icon itself still
    // matches the action (see actionIcon) the same way the "placed" marker does below.
    return <HotspotMarker bg="bg-amber-500/80" icon={actionIcon(edit, "h-3.5 w-3.5 text-white")} />;
  }
  if (state === "placed") {
    return <HotspotMarker bg="bg-[var(--accent)]/75" icon={actionIcon(edit, "h-3.5 w-3.5 text-white")} />;
  }
  return (
    <span className="relative flex items-center justify-center h-5 w-5">
      {/* Pulsing halo — draws the eye without a permanent label */}
      <span className="absolute h-5 w-5 rounded-full bg-white/70 animate-[hotspot-pulse_2.4s_ease-out_infinite]" style={{ animationDelay: `${delay}ms` }} />
      {/* Frosted-glass disc (was a solid white dot) — the room shows faintly through it. */}
      <span className="absolute h-5 w-5 rounded-full bg-white/25 backdrop-blur-md border border-white/70 ring-1 ring-inset ring-white/40 shadow-[var(--shadow-soft)]" />
      {/* Inner pip — always a clean white pearl. It used to go dark accent-green when the item was
          active, which read as a "black dot" on tap; the active state is shown by the glass name
          label now, so the pip stays white. Subtle shadow keeps it visible on the frost. */}
      <span className="relative h-2.5 w-2.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
    </span>
  );
}

/**
 * Detected-item overlay. Each item is a HIGHLIGHTED REGION, not a single dot: the whole item's
 * box is an invisible tap target (forgiving of a slightly-off box — a wrong dot used to be
 * glaring; a loose region still clearly means "the couch"), and on hover / when active it
 * outlines + fills in the accent color with its label (`HotspotRegion`, shared with the public
 * share page's `ShareHotspots.tsx` — see `hotspot-visuals.tsx`). A small state marker sits at the
 * item's anchor so the canvas shows where items are at rest without a grid of boxes. Regions
 * render largest-first so a small item (a pillow) stacks ABOVE the large one it sits on (the
 * sofa/rug) and stays individually tappable. See useRestyleWorkspace's `canvasHotspots` for how
 * each item's state (idle/confirming/queued/placed) is derived; `box_2d` comes from detection
 * (now on a stronger Gemini tier — see gemini.ts GEMINI_DETECT_MODEL).
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
            <HotspotRegion box={b} label={h.label} ariaLabel={ariaLabel}
              onClick={() => onSelect(h, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)} />
            {/* At-rest state marker + a glass name label beside it (replaces the box outline).
                The span is centered on the anchor and pointer-events-none so it never blocks a tap;
                the label flips to the left for markers near the right edge so it doesn't clip. */}
            <span
              className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
            >
              <StateMarker state={h.state} delay={i * 150} edit={h.edit} />
              {/* Name label appears only for the tapped/active item — not always-on for every
                  marker (that crowded a busy room). */}
              {isActive && <HotspotLabel text={h.label} side={m.x > 55 ? "left" : "right"} />}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
