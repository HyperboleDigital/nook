"use client";

import { useState } from "react";
import { ChevronRight, Layers } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Sheet, ShopSummaryPill, parsePrice } from "./ui";
import RestyleCanvas from "./RestyleCanvas";
import SourcePanel from "./SourcePanel";
import SimilarItemsPanel from "./SimilarItemsPanel";
import GenerateBar from "./GenerateBar";
import ChangesPanel from "./ChangesPanel";
import ShopCart from "./ShopCart";

/**
 * Immersive canvas-first editor. The room photo fills the ENTIRE stage, edge-to-edge, on every
 * breakpoint (see RestyleCanvas) — there is no docked rail and no below-image block anymore.
 * "Room Changes" lives behind a single glass trigger pill (bottom-left): tapping it pulls up a
 * floating frosted-glass panel over the photo (`Sheet`'s `glass` variant in ui.tsx) — a bottom
 * sheet on mobile, an inset floating card on desktop. Tapping any item on the photo opens the
 * SAME panel showing the sourcing/similar-items view instead of the changes list. The panel is
 * collapsed by default and dismissible (scrim tap / drag-down / Esc / the close button), so the
 * whole photo — and every hotspot on it — is one gesture away at all times.
 */
export default function RestyleStudio({ ws }: { ws: RestyleWorkspace }) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const panelOpen = changesOpen || !!ws.sourcing;

  const sourcingTitle =
    ws.sourcing?.view === "similar" ? "Similar items"
    : ws.sourcing?.view === "adjust" ? "Adjust item"
    : ws.sourcing?.view === "menu" ? "Edit item"
    : ws.sourcing?.mode === "swap" ? "Swap item" // view === "compose", reached via the menu's "Swap it"
    : "Add item";

  // Closing the panel while sourcing is open backs out of sourcing only (returning to the
  // changes list if that's how this session started, or collapsing entirely if a hotspot tap
  // opened sourcing directly) — closeSourcing nulls ws.sourcing, so panelOpen re-derives from
  // whatever changesOpen was already.
  const closePanel = () => (ws.sourcing ? ws.closeSourcing() : setChangesOpen(false));

  const count = ws.railEdits.length;
  const total = ws.railEdits.reduce((s, r) => s + parsePrice(r.edit.product_price), 0);
  const priced = ws.railEdits.some((r) => r.edit.product_price);

  return (
    <div className="relative h-full w-full">
      <RestyleCanvas ws={ws} />

      {ws.error && !ws.sourcing && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 max-w-[90%] rounded-full bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 shadow-[var(--shadow-pop)]">
          {ws.error}
        </div>
      )}

      {/* Bottom-left stack — superseded (and hidden) once the panel is showing, since it occupies
          this exact corner on desktop and covers the width on mobile. Two separate entry points,
          stacked: "Shop the look" (every real, buyable product currently in the room — the cart)
          above "Room Changes" (every staged edit, buyable or not, plus its pending/in-room
          status). Collapsing these into one pill lost the "is this actually a product I can buy"
          signal the cart used to give at a glance — keeping them separate restores that. */}
      {!panelOpen && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-4 z-10 flex flex-col items-start gap-2">
          {ws.productEdits.length > 0 && (
            <ShopSummaryPill edits={ws.productEdits} onClick={() => setCartOpen(true)} />
          )}
          <button type="button" onClick={() => setChangesOpen(true)} aria-label="Room changes"
            className="glass-surface relative inline-flex items-center gap-1.5 rounded-full text-white pl-3.5 pr-3 py-2 text-xs font-semibold shadow-[var(--shadow-pop)] hover:opacity-90 transition-opacity">
            <Layers className="h-3.5 w-3.5" />
            {count === 0 ? "Room Changes" : (
              <span>
                {count} change{count === 1 ? "" : "s"}
                {priced && <> · from ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            {/* Pending count — visible without opening the panel, so "there's something waiting
                on Generate" doesn't require a tap to discover. */}
            {ws.pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-4 text-center shadow-[var(--shadow-soft)]">
                {ws.pendingCount}
              </span>
            )}
          </button>
        </div>
      )}
      <ShopCart ws={ws} open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Generate: one compact glass pill, floating with real margin above the bottom edge on
          every breakpoint (never flush against it). Desktop: always visible — the panel only
          occupies the bottom-left third there, so Generate stays clear and reachable while
          sourcing. Mobile: hidden while the panel (a full-width sheet) is open, since it would
          sit directly underneath it. */}
      <div className="hidden md:block absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 z-10">
        <GenerateBar ws={ws} />
      </div>
      {!panelOpen && (
        <div className="md:hidden absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 -translate-x-1/2 z-10">
          <GenerateBar ws={ws} />
        </div>
      )}

      <Sheet glass open={panelOpen} onClose={closePanel} title={ws.sourcing ? sourcingTitle : undefined}>
        {ws.sourcing
          ? (ws.sourcing.view === "similar" ? <SimilarItemsPanel ws={ws} /> : <SourcePanel ws={ws} />)
          : <ChangesPanel ws={ws} />}
      </Sheet>
    </div>
  );
}
