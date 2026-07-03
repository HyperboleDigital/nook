"use client";

import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Sheet } from "./ui";
import RestyleCanvas from "./RestyleCanvas";
import ChipRow from "./ChipRow";
import StagedStrip from "./StagedStrip";
import SourcePanel from "./SourcePanel";
import SimilarItemsPanel from "./SimilarItemsPanel";
import GenerateBar from "./GenerateBar";
import ShopLook from "./ShopLook";
import VersionsStrip from "./VersionsStrip";

/**
 * The canvas-first editor. One screen: the room photo is the centerpiece with tappable
 * item chips/hotspots; tapping one opens the sourcing panel (bottom sheet on mobile, side
 * panel on desktop). No step wizard, no separate "result" screen — displayUrl decides what
 * the canvas shows, and Shop-this-look + versions appear underneath once a render exists.
 */
export default function RestyleStudio({ ws }: { ws: RestyleWorkspace }) {
  const hasRender = ws.renders.length > 0;

  return (
    <div className="flex flex-col md:flex-row md:items-start md:gap-0 md:border md:border-[var(--border)] md:h-[calc(100dvh-140px)]">
      <div className="flex-1 min-w-0 flex flex-col md:h-full md:overflow-y-auto">
        <div className="p-3 md:p-4 space-y-3 flex-1">
          <RestyleCanvas ws={ws} />
          <ChipRow ws={ws} />
          <StagedStrip ws={ws} />
          {hasRender && <ShopLook ws={ws} />}
          <VersionsStrip ws={ws} />
          {ws.error && !ws.sourcing && (
            <p className="text-xs text-red-600">{ws.error}</p>
          )}
        </div>
        <GenerateBar ws={ws} />
      </div>

      <Sheet open={!!ws.sourcing} onClose={ws.closeSourcing}
        title={ws.sourcing?.view === "similar" ? "Similar items" : ws.sourcing?.mode === "swap" ? "Swap item" : "Add item"}>
        {ws.sourcing?.view === "similar" ? <SimilarItemsPanel ws={ws} /> : <SourcePanel ws={ws} />}
      </Sheet>
    </div>
  );
}
