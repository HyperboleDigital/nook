"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Eraser, RotateCcw } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, IconButton } from "./ui";
import { cn } from "@/lib/utils";

/**
 * Primary Generate action + an overflow menu for secondary actions. `variant="floating"`
 * (desktop, immersive layout) renders as a self-contained rounded pill; `"sticky"` (mobile)
 * spans the bottom of the stacked column as before.
 */
export default function GenerateBar({ ws, variant = "sticky" }: { ws: RestyleWorkspace; variant?: "sticky" | "floating" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  const emptyRoom = () => {
    setMenuOpen(false);
    if (window.confirm("Empty the room? Furniture and decor get removed — walls, floors, windows and built-ins stay put.")) {
      ws.emptyRoom();
    }
  };

  const startFromOriginal = async () => {
    setMenuOpen(false);
    if (!ws.restyle) return;
    await ws.deactivateAll();
    ws.setPreviewUrl(ws.restyle.original_url);
  };

  return (
    <div className={cn(
      "flex items-center gap-2",
      variant === "floating"
        ? "rounded-full bg-white shadow-[var(--shadow-pop)] border border-[var(--border)] px-2 py-2"
        : "sticky bottom-0 bg-white border-t border-[var(--border)] px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
    )}>
      <div className="relative" ref={menuRef}>
        <IconButton onClick={() => setMenuOpen((v) => !v)} aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
        {menuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-56 rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)] overflow-hidden">
            <button type="button" onClick={emptyRoom}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-[var(--muted)] transition-colors">
              <Eraser className="h-4 w-4 text-[var(--muted-foreground)]" /> Empty the room
            </button>
            <button type="button" onClick={startFromOriginal}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-[var(--muted)] transition-colors border-t border-[var(--border)]">
              <RotateCcw className="h-4 w-4 text-[var(--muted-foreground)]" /> Start from original
            </button>
          </div>
        )}
      </div>
      <Button variant="primary" size="lg" className="flex-1" disabled={!ws.canGenerate || ws.generating} onClick={() => ws.generate()}>
        {ws.generating
          ? <>Generating…</>
          : <>Generate{ws.activeEdits.length > 0 && <span className="ml-1 rounded-full bg-white/20 text-[10px] font-bold px-1.5 py-0.5">{ws.activeEdits.length}</span>}</>}
      </Button>
    </div>
  );
}
