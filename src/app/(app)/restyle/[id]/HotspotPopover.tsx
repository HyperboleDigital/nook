"use client";

import { X, ExternalLink } from "lucide-react";
import type { RestyleEdit } from "@/types";
import { Button, IconButton, storeName } from "./ui";

/**
 * Floating product card anchored near a tapped hotspot — shows what's already placed there
 * (real product or just an inspo photo) with a "Show similar" action to find/swap it, instead
 * of jumping straight into the full sourcing sheet. Positioned at (cx, cy) percent within the
 * nearest relatively-positioned ancestor (the canvas image wrapper).
 */
export default function HotspotPopover({
  edit, label, cx, cy, onShowSimilar, onClose,
}: {
  edit: RestyleEdit | null; // null when the slot has nothing staged yet
  label: string;
  cx: number;
  cy: number;
  onShowSimilar: () => void;
  onClose: () => void;
}) {
  const hasProduct = !!edit?.buy_url;

  return (
    <div
      className="absolute z-10 w-72 max-w-[85vw] border border-[var(--foreground)] bg-white"
      style={{
        left: `${Math.min(Math.max(cx, 18), 82)}%`,
        top: `${Math.min(cy + 6, 90)}%`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="flex items-start gap-3 p-3">
        {edit?.reference_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={edit.reference_url} alt="" className="h-16 w-16 object-cover border border-[var(--border)] shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold capitalize leading-snug">{edit?.product_title ?? label}</p>
          {hasProduct ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {storeName(edit!.buy_url)}
              {edit?.product_price && <> · <span className="font-medium text-[var(--foreground)]">{edit.product_price}</span></>}
            </p>
          ) : edit ? (
            <p className="text-xs text-[var(--muted-foreground)]">From your photo — not sourced yet</p>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">Nothing here yet</p>
          )}
        </div>
        <IconButton onClick={onClose} aria-label="Close" className="h-6 w-6 shrink-0 -mt-1 -mr-1">
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      {edit?.reference_desc && (
        <p className="px-3 pb-2 text-xs text-[var(--muted-foreground)] leading-relaxed line-clamp-2">{edit.reference_desc}</p>
      )}

      <div className="flex gap-2 p-3 pt-0">
        <Button size="sm" variant="primary" className="flex-1" onClick={onShowSimilar}>
          {edit ? "Show similar" : "Add something here"}
        </Button>
        {hasProduct && (
          <a href={edit!.buy_url!} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" aria-label="View product">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
