"use client";

import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Sheet, SheetChrome, StatusBanner } from "./ui";
import RestyleCanvas from "./RestyleCanvas";
import SourcePanel from "./SourcePanel";
import SimilarItemsPanel from "./SimilarItemsPanel";
import GenerateBar from "./GenerateBar";
import ChangesPanel from "./ChangesPanel";

/**
 * Immersive canvas-first editor. Desktop: the room photo fills its own edge-to-edge stage (see
 * RestyleCanvas) with Generate/version-history floating over the stage itself. The rail is a
 * REAL docked column (not an absolute overlay) — a landscape photo close to the stage's own
 * aspect ratio has little or no gutter, so a floating rail would sit on top of real hotspots
 * (a chair, a lamp, a plant) rather than the blurred backdrop, making them untappable. Docking
 * it as a sibling column means the canvas's own measured width (RestyleCanvas's ResizeObserver)
 * naturally excludes the rail, so the photo always shrinks to fit beside it instead of under
 * it. The rail defaults to ChangesPanel — a single persistent list of every relevant change
 * (staged, in the room, or switched off), whether or not anything's been generated yet — and
 * swaps to the sourcing/similar-items panel while one is open. Always visible on desktop (a
 * collapse toggle used to live here; removed — the rail is core to the editor, not an optional
 * overlay to tuck away). Mobile has no room for a side column at all, so it falls back to the
 * previous stacked-column layout with a bottom-sheet for sourcing.
 */
export default function RestyleStudio({ ws }: { ws: RestyleWorkspace }) {
  const sourcingTitle =
    ws.sourcing?.view === "similar" ? "Similar items"
    : ws.sourcing?.view === "adjust" ? "Adjust item"
    : ws.sourcing?.view === "menu" ? "Edit item"
    : ws.sourcing?.mode === "swap" ? "Swap item" // view === "compose", reached via the menu's "Swap it"
    : "Add item";

  const railContent = ws.sourcing ? (
    <>
      <SheetChrome title={sourcingTitle} onClose={ws.closeSourcing} />
      <div className="px-4 pb-4">
        {ws.sourcing.view === "similar" ? <SimilarItemsPanel ws={ws} /> : <SourcePanel ws={ws} />}
      </div>
    </>
  ) : (
    <div className="p-4">
      <ChangesPanel ws={ws} />
    </div>
  );

  return (
    <>
      {/* Desktop immersive stage */}
      <div className="hidden md:flex h-full w-full">
        <div className="relative flex-1 min-w-0 h-full">
          <RestyleCanvas ws={ws} />

          {ws.error && !ws.sourcing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-md rounded-full bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 shadow-[var(--shadow-pop)]">
              {ws.error}
            </div>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <GenerateBar ws={ws} variant="floating" />
          </div>
        </div>

        <div className="w-[380px] shrink-0 border-l border-[var(--border)] bg-white overflow-y-auto">
          {railContent}
        </div>
      </div>

      {/* Mobile — same edge-to-edge, blurred-backdrop stage as desktop (RestyleCanvas handles
          both now), full-bleed at the top with no page padding; queued changes / shop-the-look
          go directly below it in the scrolling column, in their own padded area. */}
      <div className="md:hidden h-full overflow-y-auto flex flex-col">
        <RestyleCanvas ws={ws} />
        <div className="p-3 space-y-3 flex-1">
          {/* Directly under the canvas, visible without scrolling — used to sit below the whole
              changes list, easy to miss on a long list. */}
          {ws.error && !ws.sourcing && <StatusBanner variant="error">{ws.error}</StatusBanner>}
          <ChangesPanel ws={ws} />
        </div>
        <GenerateBar ws={ws} />
      </div>

      {/* Mobile bottom sheet for sourcing/similar-items */}
      <div className="md:hidden">
        <Sheet open={!!ws.sourcing} onClose={ws.closeSourcing} title={sourcingTitle}>
          {ws.sourcing?.view === "similar" ? <SimilarItemsPanel ws={ws} /> : <SourcePanel ws={ws} />}
        </Sheet>
      </div>
    </>
  );
}
