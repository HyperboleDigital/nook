"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button, IconButton, Input } from "./ui";

/**
 * Overlay for placing a new "add" item on the ORIGINAL photo — tap-to-drop a pin (0–1000
 * coords, same space as detected_objects box_2d) plus an optional short note. Placement is
 * always optional: Skip/X leaves it unset and Generate is never blocked on it. Sits above
 * ObjectHotspots and swallows its clicks while active.
 */
export default function PinPlacementLayer({
  label, onPlace, onCancel,
}: {
  label: string;
  onPlace: (x: number, y: number, note: string | null) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [note, setNote] = useState("");
  // "the sofa" vs "it" — `label` is empty in the upfront add flow (location is chosen before the
  // item is named), so never emit "the this item"/"the it".
  const what = label.trim() && label.trim() !== "this item" ? `the ${label.trim()}` : "it";

  const aim = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = Math.round(Math.min(1000, Math.max(0, ((clientX - rect.left) / rect.width) * 1000)));
    const y = Math.round(Math.min(1000, Math.max(0, ((clientY - rect.top) / rect.height) * 1000)));
    setPin({ x, y });
  };

  // NOTE: the "tap where it should go" instruction + Skip deliberately live OUTSIDE the image
  // now (in RestyleCanvas, in a bar above the photo) — a pill floating over the image covered
  // the very spot a user might want to place the item. This layer is now just the invisible
  // tap-catcher plus the confirm popover that appears AT the chosen point after a tap.
  return (
    <div
      className="absolute inset-0 z-20 cursor-crosshair"
      onClick={(e) => aim(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
    >
      {pin && (
        <>
          <span
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center h-8 w-8 rounded-full bg-[var(--accent)] text-white shadow-[var(--shadow-pop)]"
            style={{ left: `${pin.x / 10}%`, top: `${pin.y / 10}%` }}
          >
            <MapPin className="h-4 w-4" />
          </span>

          <div
            className="absolute z-10 w-64 max-w-[80vw] rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]"
            style={{
              // Clamp in PIXELS, not just percent — a percent-only clamp assumes the image is
              // wide enough that half the card's fixed width is a small percentage of it,
              // which breaks (clips the card off the edge) on a narrower rendered image.
              left: `clamp(128px, ${pin.x / 10}%, calc(100% - 128px))`,
              top: pin.y > 500 ? undefined : `${Math.min(pin.y / 10 + 6, 88)}%`,
              bottom: pin.y > 500 ? `${100 - pin.y / 10 + 6}%` : undefined,
              transform: "translateX(-50%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 pb-2">
              <p className="text-sm font-semibold">Place {what} here?</p>
              <IconButton onClick={onCancel} aria-label="Cancel" className="h-6 w-6 shrink-0 -mt-1 -mr-1">
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            <div className="px-3 pb-3 space-y-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
                placeholder="Optional note — e.g. next to the window" />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" className="flex-1"
                  onClick={() => onPlace(pin.x, pin.y, note.trim() || null)}>
                  Place here
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPin(null)}>
                  Re-tap
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
