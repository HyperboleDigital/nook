"use client";

import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Sheet, SheetChrome } from "./ui";
import RestyleCanvas from "./RestyleCanvas";
import ChipRow from "./ChipRow";
import SourcePanel from "./SourcePanel";
import SimilarItemsPanel from "./SimilarItemsPanel";
import GenerateBar from "./GenerateBar";
import ShopLook from "./ShopLook";
import QueuedChanges from "./QueuedChanges";
import VersionsStrip from "./VersionsStrip";

/**
 * The canvas-first editor. Room photo + chips/hotspots on the left; a right-hand rail that
 * defaults to either "Queued changes" (viewing the original — nothing's been generated into
 * the photo yet, so this is what WILL be there) or "Shop this look" (viewing a render — what's
 * actually IN it), and swaps to the sourcing/similar-items panel while one is open. On mobile
 * there's no room for a persistent rail, so the same queued/shop content stays inline below
 * the canvas and sourcing uses the bottom sheet overlay instead.
 */
export default function RestyleStudio({ ws }: { ws: RestyleWorkspace }) {
  const hasRender = ws.renders.length > 0;
  const sourcingTitle = ws.sourcing?.view === "similar" ? "Similar items" : ws.sourcing?.mode === "swap" ? "Swap item" : "Add item";

  return (
    <div className="flex flex-col md:flex-row md:items-start md:gap-0 md:border md:border-[var(--border)] md:rounded-3xl md:overflow-hidden md:h-[calc(100dvh-140px)]">
      <div className="flex-1 min-w-0 flex flex-col md:h-full md:overflow-y-auto">
        <div className="p-3 md:p-4 space-y-3 flex-1">
          <RestyleCanvas ws={ws} />
          <ChipRow ws={ws} />
          {/* Mobile only — desktop shows these in the persistent right rail instead */}
          <div className="md:hidden">
            {ws.viewingOriginal ? <QueuedChanges ws={ws} /> : hasRender ? <ShopLook ws={ws} /> : null}
          </div>
          <VersionsStrip ws={ws} />
          {ws.error && !ws.sourcing && (
            <p className="text-xs text-red-600">{ws.error}</p>
          )}
        </div>
        <GenerateBar ws={ws} />
      </div>

      {/* Desktop persistent right rail */}
      <div className="hidden md:flex md:flex-col md:w-[400px] md:shrink-0 md:border-l md:border-[var(--border)] md:bg-white md:h-full md:overflow-y-auto">
        {ws.sourcing ? (
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
        )}
      </div>

      {/* Mobile bottom sheet for sourcing/similar-items */}
      <Sheet open={!!ws.sourcing} onClose={ws.closeSourcing} title={sourcingTitle}>
        {ws.sourcing?.view === "similar" ? <SimilarItemsPanel ws={ws} /> : <SourcePanel ws={ws} />}
      </Sheet>
    </div>
  );
}
