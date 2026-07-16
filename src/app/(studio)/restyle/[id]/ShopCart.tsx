"use client";

import { ExternalLink, TrendingDown } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { boxFromPlacement } from "./useRestyleWorkspace";
import { Modal, parsePrice, shopSummary, storeName } from "./ui";
import CroppedThumb from "./CroppedThumb";

// The "cart" behind the canvas's shop-summary pill: one place to see everything the room made
// shoppable — each in-room product with its price, a direct "View" link to the retailer, and, when
// the post-generate cheaper search found a genuinely lower price, the cheaper listing + how much it
// saves. The footer totals the room and the total potential savings. Read-only aggregation of what
// the change cards already show — no new state, no searches fired here.
export default function ShopCart({ ws, open, onClose }: { ws: RestyleWorkspace; open: boolean; onClose: () => void }) {
  const items = ws.productEdits;
  const { total, priced } = shopSummary(items);

  const rows = items.map((e) => {
    const label = (e.target_label ?? "").toLowerCase();
    const search = ws.searches[label];
    const refPrice = parsePrice(e.product_price);
    const best = (search?.status === "ready" && refPrice > 0)
      ? search.results.map((r) => ({ r, p: parsePrice(r.price) }))
          .filter((x) => x.p > 0 && x.p < refPrice).sort((a, b) => a.p - b.p)[0]
      : undefined;
    const savings = best ? Math.round(refPrice - best.p) : 0;
    return { e, best, savings };
  });
  const totalSavings = rows.reduce((s, r) => s + r.savings, 0);

  return (
    <Modal open={open} onClose={onClose} title="Shop this room" widthClassName="max-w-md">
      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-[var(--muted-foreground)]">Nothing shoppable in the room yet — swap or add a product, then generate.</p>
        )}

        {rows.map(({ e, best, savings }) => {
          const cheaperUrl = best ? (best.r.productUrl ?? best.r.alternates?.[0]?.url ?? null) : null;
          return (
            <div key={e.id} className="flex gap-3 rounded-2xl border border-[var(--border)] p-3">
              {e.reference_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-[var(--border)] bg-[var(--muted)] shrink-0" />
              ) : e.placement ? (
                <CroppedThumb imageUrl={ws.displayUrl} box_2d={boxFromPlacement(e.placement)}
                  className="h-14 w-14 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--muted)] shrink-0" />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0" />
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium capitalize line-clamp-2 leading-snug">{e.product_title ?? e.target_label}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {e.product_price && <span className="font-semibold text-[var(--foreground)]">{e.product_price}</span>}
                  {e.product_price && e.buy_url && " · "}
                  {e.buy_url && storeName(e.buy_url)}
                </p>
                {best && savings > 0 && (
                  <a href={cheaperUrl ?? undefined} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold px-2 py-0.5 hover:bg-emerald-100 transition-colors">
                    <TrendingDown className="h-3 w-3" />
                    Save ${savings} at {storeName(cheaperUrl) || best.r.retailer}
                  </a>
                )}
              </div>

              {e.buy_url && (
                <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
                  className="self-start inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white text-xs font-medium px-3 py-1.5 hover:border-[var(--foreground)] transition-colors shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </a>
              )}
            </div>
          );
        })}

        {priced > 0 && (
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
            <span className="text-sm">
              <span className="font-semibold">{items.length}</span>
              <span className="text-[var(--muted-foreground)]"> item{items.length === 1 ? "" : "s"} · </span>
              <span className="font-semibold">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
            {totalSavings > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-2.5 py-1">
                <TrendingDown className="h-3.5 w-3.5" /> Save up to ${totalSavings}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
