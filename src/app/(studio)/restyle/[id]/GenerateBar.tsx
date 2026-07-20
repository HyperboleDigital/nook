"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Eraser, RotateCcw, Loader2, Sparkles, Wand2 } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, ConfirmDialog, IconButton } from "./ui";
import StagePicker from "./StagePicker";
import type { RestyleThemeKey } from "@/lib/restyle-themes";

/**
 * Primary Generate action + an overflow menu for secondary actions — a compact, self-contained
 * glass pill that floats over the full-bleed room photo, the SAME shape on every breakpoint
 * (RestyleStudio positions it bottom-center with margin above the edge, never flush against it —
 * a full-width edge-to-edge bar used to read as glued to the bottom of the screen).
 */
export default function GenerateBar({ ws }: { ws: RestyleWorkspace }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emptyRoomConfirmOpen, setEmptyRoomConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const emptyRoom = () => {
    setMenuOpen(false);
    setEmptyRoomConfirmOpen(true);
  };

  const pickStage = (theme: RestyleThemeKey) => {
    setPickerOpen(false);
    ws.stageRoom(theme);
  };

  // Turn every change off and re-render — with no active edits, recompose returns the original
  // (a cheap no-Gemini short-circuit), so `current_url` becomes the bare room. There's one
  // image, so this actually regenerates rather than just previewing the original.
  const startFromOriginal = async () => {
    setMenuOpen(false);
    if (!ws.restyle) return;
    await ws.deactivateAll();
    await ws.generate();
  };

  const confirming = ws.confirmingCount > 0;
  const upToDate = !ws.generating && !confirming && ws.pendingCount === 0 && ws.renders.length > 0;

  return (
    <div className="glass-surface flex flex-col gap-1.5 rounded-3xl px-2 py-2">
      <div className="flex items-center gap-2">
        <div className="relative" ref={menuRef}>
          <IconButton glass onClick={() => setMenuOpen((v) => !v)} aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
          {menuOpen && (
            <div className="glass-surface absolute bottom-full left-0 mb-2 w-56 rounded-2xl overflow-hidden divide-y divide-white/15">
              <button type="button" onClick={emptyRoom}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-white/85 hover:bg-white/10 hover:text-white transition-colors">
                <Eraser className="h-4 w-4" /> Empty the room
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); setPickerOpen(true); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-white/85 hover:bg-white/10 hover:text-white transition-colors">
                <Sparkles className="h-4 w-4" /> Stage this room
              </button>
              <button type="button" onClick={startFromOriginal}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-white/85 hover:bg-white/10 hover:text-white transition-colors">
                <RotateCcw className="h-4 w-4" /> Start from original
              </button>
            </div>
          )}
        </div>
        <Button variant="primary" size="lg" className="flex-1" disabled={!ws.canGenerate || ws.generating} onClick={() => ws.generate()}>
          {ws.generating
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : confirming
            // Disabled-with-no-explanation used to look like a stuck app when a slow/degraded
            // product lookup (Unwrangle/SerpApi) left an item optimistically staged for a while —
            // spell out why Generate is greyed out instead of just greying it out silently.
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Confirming {ws.confirmingCount} item{ws.confirmingCount === 1 ? "" : "s"}…</>
            : upToDate
            ? <>Looking good as-is!</>
            // pendingCount (not activeEdits.length) — the diff between what's active and what's
            // actually in the current render, so this resets to 0 (and hides) after a successful
            // generate instead of staying at "3" forever just because 3 edits are still active.
            : <><Wand2 className="h-4 w-4" /> Magic Generate{ws.pendingCount > 0 && <span className="ml-1 rounded-full bg-white/20 text-[10px] font-bold px-1.5 py-0.5">{ws.pendingCount}</span>}</>}
        </Button>
      </div>
      {confirming && (
        <p className="text-[11px] text-white/70 text-center px-1">
          Fetching product details — this can take up to a minute.
        </p>
      )}
      <StagePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={pickStage} />
      <ConfirmDialog
        open={emptyRoomConfirmOpen}
        onClose={() => setEmptyRoomConfirmOpen(false)}
        onConfirm={() => ws.emptyRoom()}
        title="Empty the room?"
        body="Furniture and decor get removed — walls, floors, windows and built-ins stay put."
        confirmLabel="Empty the room"
        destructive
      />
    </div>
  );
}
