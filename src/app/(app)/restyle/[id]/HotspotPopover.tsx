"use client";

import { X, Search, ShoppingCart, Power } from "lucide-react";
import type { RestyleEdit } from "@/types";
import { Button, IconButton, storeName } from "./ui";

/**
 * Floating product card anchored near a tapped "placed" hotspot: thumb, title, retailer +
 * "Link to product", price, a Power toggle to revert it to original, then a "Show similar" /
 * buy action pair. The caller (RestyleCanvas) only ever shows this for a `placed` canvasHotspot,
 * which by construction can't occur on the original photo (see useRestyleWorkspace's
 * `canvasHotspots`) — so this component never needs to worry about running on an unrendered
 * image. Flips above/below the dot depending on which half of the frame it's in, since the
 * canvas is `overflow-hidden` and a card anchored below a low dot would otherwise clip off the
 * bottom edge.
 */
export default function HotspotPopover({
  edit, label, cx, cy, onShowSimilar, onToggleOff, onClose,
}: {
  edit: RestyleEdit; // caller only renders this when something IS staged at the slot
  label: string;
  cx: number;
  cy: number;
  onShowSimilar: () => void;
  onToggleOff: () => void; // flips this item off and regenerates right away
  onClose: () => void;
}) {
  const hasProduct = !!edit.buy_url;
  // Flip the card above the dot when it's in the lower half of the frame — otherwise it
  // clips off the bottom edge of the (overflow-hidden) canvas.
  const below = cy <= 50;
  // Horizontal position is clamped in PIXELS (via clamp(), mixing px and %), not just percent
  // of the image — a percent-only clamp assumes the image is wide enough that half the card's
  // fixed width is a small percentage of it, which breaks on a narrower rendered image (e.g. a
  // portrait photo, or a smaller viewport) and clips the card off the edge.
  const HALF_WIDTH_PX = 128; // half of w-64 (256px)

  return (
    <div
      className="absolute z-10 w-64 max-w-[80vw] rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]"
      style={{
        left: `clamp(${HALF_WIDTH_PX}px, ${cx}%, calc(100% - ${HALF_WIDTH_PX}px))`,
        top: below ? `${Math.min(cy + 5, 88)}%` : undefined,
        bottom: below ? undefined : `${Math.min(100 - cy + 5, 88)}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex items-start gap-3 p-3 pb-2">
        {edit.reference_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={edit.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-[var(--border)] shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold capitalize leading-snug">{edit.product_title ?? label}</p>
          {hasProduct ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {storeName(edit.buy_url)} · <a href={edit.buy_url!} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--foreground)]">Link to product</a>
            </p>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">From your photo — not sourced yet</p>
          )}
          {edit.product_price && <p className="text-sm font-bold">{edit.product_price}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
          <IconButton onClick={onToggleOff} aria-label="Turn off — revert to original" className="h-6 w-6">
            <Power className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton onClick={onClose} aria-label="Close" className="h-6 w-6">
            <X className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex gap-2 p-3 pt-0">
        <Button size="sm" variant="accentSoft" className="flex-1" onClick={onShowSimilar}>
          <Search className="h-3.5 w-3.5" /> Show similar
        </Button>
        {hasProduct && (
          <a href={edit.buy_url!} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button size="sm" variant="accent" className="w-full">
              <ShoppingCart className="h-3.5 w-3.5" /> Buy
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
