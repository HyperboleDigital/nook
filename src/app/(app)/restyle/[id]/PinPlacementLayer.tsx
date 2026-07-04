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

  const aim = (clientX: number, clientY: number, rect: DOMRect) => {
    const x = Math.round(Math.min(1000, Math.max(0, ((clientX - rect.left) / rect.width) * 1000)));
    const y = Math.round(Math.min(1000, Math.max(0, ((clientY - rect.top) / rect.height) * 1000)));
    setPin({ x, y });
  };

  return (
    <div
      className="absolute inset-0 z-20 cursor-crosshair"
      onClick={(e) => aim(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
    >
      {!pin && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-[var(--foreground)] text-white pl-4 pr-2 py-1.5 text-xs shadow-[var(--shadow-pop)] whitespace-nowrap">
          <span>Tap where the {label} should go</span>
          <button type="button" onClick={(e) => { e.stopPropagation(); onCancel(); }}
            className="rounded-full px-2 py-0.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            Skip
          </button>
        </div>
      )}

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
              left: `${Math.min(Math.max(pin.x / 10, 18), 82)}%`,
              top: pin.y > 500 ? undefined : `${Math.min(pin.y / 10 + 6, 88)}%`,
              bottom: pin.y > 500 ? `${100 - pin.y / 10 + 6}%` : undefined,
              transform: "translateX(-50%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 pb-2">
              <p className="text-sm font-semibold">Place the {label} here?</p>
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
