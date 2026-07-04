"use client";

import { X, Search, ShoppingCart } from "lucide-react";
import type { RestyleEdit } from "@/types";
import { Button, IconButton, storeName } from "./ui";

/**
 * Floating product card anchored near a tapped hotspot — mirrors the reference design: thumb,
 * title, retailer + "Link to product", price, a short description, then a "Show similar" /
 * buy action pair. Shown for whatever's already placed at that slot; tapping an empty slot on
 * the original photo skips this and opens the sourcing form directly (nothing to preview yet).
 */
export default function HotspotPopover({
  edit, label, cx, cy, onShowSimilar, onClose,
}: {
  edit: RestyleEdit; // caller only renders this when something IS staged at the slot
  label: string;
  cx: number;
  cy: number;
  onShowSimilar: () => void;
  onClose: () => void;
}) {
  const hasProduct = !!edit.buy_url;

  return (
    <div
      className="absolute z-10 w-72 max-w-[85vw] rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]"
      style={{
        left: `${Math.min(Math.max(cx, 18), 82)}%`,
        top: `${Math.min(cy + 6, 88)}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex items-start gap-3 p-3 pb-2">
        {edit.reference_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={edit.reference_url} alt="" className="h-16 w-16 object-cover rounded-xl border border-[var(--border)] shrink-0" />
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
        <IconButton onClick={onClose} aria-label="Close" className="h-6 w-6 shrink-0 -mt-1 -mr-1">
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {edit.reference_desc && (
        <p className="px-3 pb-3 text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2">{edit.reference_desc}</p>
      )}

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
