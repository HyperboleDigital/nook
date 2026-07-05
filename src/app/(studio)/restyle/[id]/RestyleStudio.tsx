"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { IconButton, Sheet, SheetChrome } from "./ui";
import RestyleCanvas from "./RestyleCanvas";
import SourcePanel from "./SourcePanel";
import SimilarItemsPanel from "./SimilarItemsPanel";
import GenerateBar from "./GenerateBar";
import ShopLook from "./ShopLook";
import QueuedChanges from "./QueuedChanges";
import VersionsStrip from "./VersionsStrip";

/**
 * Immersive canvas-first editor. Desktop: the room photo fills its own edge-to-edge stage (see
 * RestyleCanvas) with Generate/version-history floating over the stage itself. The rail is a
 * REAL docked column (not an absolute overlay) — a landscape photo close to the stage's own
 * aspect ratio has little or no gutter, so a floating rail would sit on top of real hotspots
 * (a chair, a lamp, a plant) rather than the blurred backdrop, making them untappable. Docking
 * it as a sibling column means the canvas's own measured width (RestyleCanvas's ResizeObserver)
 * naturally excludes the rail, so the photo always shrinks to fit beside it instead of under
 * it. The rail defaults to "Queued changes" (viewing the original — nothing's actually in the
 * photo yet, so this is what WILL be there) or "Shop this look" (viewing a render — what's
 * actually IN it), and swaps to the sourcing/similar-items panel while one is open; still
 * collapsible for a fully edge-to-edge view. Mobile has no room for a side column at all, so it
 * falls back to the previous stacked-column layout with a bottom-sheet for sourcing.
 */
export default function RestyleStudio({ ws }: { ws: RestyleWorkspace }) {
  const hasRender = ws.renders.length > 0;
  const sourcingTitle = ws.sourcing?.view === "similar" ? "Similar items" : ws.sourcing?.mode === "swap" ? "Swap item" : "Add item";
  const [railOpen, setRailOpen] = useState(true);

  const railContent = ws.sourcing ? (
    <>
      <SheetChrome title={sourcingTitle} onClose={ws.closeSourcing} />
      <div className="px-4 pb-4">
        {ws.sourcing.view === "similar" ? <SimilarItemsPanel ws={ws} /> : <SourcePanel ws={ws} />}
      </div>
    </>
  ) : (
    <div className="p-4">
      {ws.viewingOriginal ? <QueuedChanges ws={ws} /> : hasRender ? <ShopLook ws={ws} /> : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nothing to shop yet — tap an item to swap it, then generate to see it here.
        </p>
      )}
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

          {ws.renders.length > 0 && (
            <div className="absolute bottom-4 left-4 max-w-[min(60vw,28rem)] rounded-2xl bg-white/95 shadow-[var(--shadow-pop)] border border-[var(--border)] p-2">
              <VersionsStrip ws={ws} />
            </div>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <GenerateBar ws={ws} variant="floating" />
          </div>

          {!railOpen && (
            <IconButton onClick={() => setRailOpen(true)} aria-label="Expand panel"
              className="absolute right-4 top-4 shadow-[var(--shadow-pop)]">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </IconButton>
          )}
        </div>

        {railOpen && (
          <div className="w-[380px] shrink-0 border-l border-[var(--border)] bg-white overflow-y-auto">
            <div className="flex items-center justify-end px-2 pt-2">
              <IconButton onClick={() => setRailOpen(false)} aria-label="Collapse panel" className="h-7 w-7">
                <ChevronRight className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            {railContent}
          </div>
        )}
      </div>

      {/* Mobile — same edge-to-edge, blurred-backdrop stage as desktop (RestyleCanvas handles
          both now), full-bleed at the top with no page padding; queued changes / shop-the-look
          go directly below it in the scrolling column, in their own padded area. */}
      <div className="md:hidden h-full overflow-y-auto flex flex-col">
        <RestyleCanvas ws={ws} />
        <div className="p-3 space-y-3 flex-1">
          {ws.viewingOriginal ? <QueuedChanges ws={ws} /> : hasRender ? <ShopLook ws={ws} /> : null}
          <VersionsStrip ws={ws} />
          {ws.error && !ws.sourcing && <p className="text-xs text-red-600">{ws.error}</p>}
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
