import type { DetectedObject } from "@/types";

export interface PinPlacement {
  x: number;
  y: number;
  note?: string | null;
}

// Same filter as the client's NOT_SWAPPABLE (useRestyleWorkspace.ts) — duplicated here
// rather than imported so server code doesn't pull in a client hook module.
const STRUCTURAL_LABEL = /^(the\s+)?(left|right|back|front|far)?\s*(walls?|ceiling|floors?)$/i;

/**
 * Convert a 0–1000 pin on the original photo into region-level natural language for the
 * composeEdits "Place it …" prompt slot, e.g.
 * "in the left part of the room, on or near the floor, near the sofa (the user specifies: "next to the window")".
 *
 * Deliberately coarse: the image model can honor thirds/bands and named neighbors, not
 * pixel coordinates — image-thirds also aren't room-thirds under perspective, so anything
 * more precise would be false confidence.
 */
export function describePlacement(pin: PinPlacement, detected: DetectedObject[] | null): string {
  const horizontal =
    pin.x < 333 ? "in the left part of the room"
    : pin.x < 667 ? "in the middle of the room"
    : "in the right part of the room";

  // A floor-level tap needs an unambiguous, physically explicit instruction — "on or near the
  // floor" was too soft and a model would sometimes place the item at a neighboring object's
  // height instead of the ground (e.g. a basket pinned beside a TV stand rendered floating at
  // shelf height). The floor band is also intentionally generous (anything in the lower half
  // of the photo): most floor taps land well above the very bottom edge once camera angle and
  // the object's own height are accounted for.
  const isFloor = pin.y > 500;
  const isHigh = pin.y < 350;
  const vertical = isFloor
    ? "resting directly on the floor, in full contact with the ground — it must NOT float, hover, or appear mounted/elevated"
    : isHigh
      ? "mounted or placed high up, at wall/upper-shelf height"
      : "at mid height (e.g. on a table or counter surface, not on the floor and not high on the wall)";

  // Nearest detected objects: distance from the pin to the clamped nearest point of each
  // box ([ymin, xmin, ymax, xmax], 0–1000). Zero inside the box.
  const neighbors = (detected ?? [])
    .filter((o) => !STRUCTURAL_LABEL.test(o.label.trim()))
    .map((o) => {
      const [ymin, xmin, ymax, xmax] = o.box_2d;
      const dx = Math.max(xmin - pin.x, 0, pin.x - xmax);
      const dy = Math.max(ymin - pin.y, 0, pin.y - ymax);
      return { label: o.label, dist: Math.hypot(dx, dy) };
    })
    .filter((n) => n.dist < 250)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 2);

  // "near the TV stand" alone is ambiguous about height — for a floor placement, spell out
  // that proximity means alongside it ON THE GROUND, not at the neighbor's own height (this is
  // what caused a floor-pinned item to render floating near an elevated neighbor).
  const neighborNames = neighbors.map((n) => n.label);
  const near =
    neighborNames.length === 2 ? `${isFloor ? "on the floor beside" : "near"} the ${neighborNames[0]} and the ${neighborNames[1]}${isFloor ? " (at ground level, not on top of or elevated near them)" : ""}`
    : neighborNames.length === 1 ? `${isFloor ? "on the floor beside" : "near"} the ${neighborNames[0]}${isFloor ? " (at ground level, not on top of or elevated near it)" : ""}`
    : "";

  const note = pin.note?.trim();
  const noteSuffix = note ? ` (the user specifies: "${note}")` : "";

  return `${horizontal}, ${vertical}${near ? `, ${near}` : ""}${noteSuffix}`;
}
