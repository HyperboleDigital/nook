"use client";

import { ExternalLink } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { boxFromPlacement } from "./useRestyleWorkspace";
import { Modal, shopSummary, storeName } from "./ui";
import CroppedThumb from "./CroppedThumb";

// The "cart" behind the canvas's shop-summary pill: one place to see everything the room made
// shoppable — each in-room product with its price and a direct "View" link to the retailer, plus a
// room total. Deliberately makes NO "savings" claim: a genuine cheaper-than-this comparison needs a
// confirmed SAME-product match (not a keyword lookup that returns random similar items), so
// alternatives live in "Try something else" where the real products are compared. Read-only.
export default function ShopCart({ ws, open, onClose }: { ws: RestyleWorkspace; open: boolean; onClose: () => void }) {
  const items = ws.productEdits;
  const { total, priced } = shopSummary(items);

  return (
    <Modal glass open={open} onClose={onClose} title="Shop this room" widthClassName="max-w-md">
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-white/60">Nothing shoppable in the room yet — swap or add a product, then generate.</p>
        )}

        {items.map((e) => (
          <div key={e.id} className="glass-card flex gap-3 rounded-2xl p-3">
            {e.reference_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={e.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-white/20 bg-white/10 shrink-0" />
            ) : e.placement ? (
              <CroppedThumb imageUrl={ws.displayUrl} box_2d={boxFromPlacement(e.placement)}
                className="h-14 w-14 rounded-xl overflow-hidden border border-white/20 bg-white/10 shrink-0" />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-white/10 border border-white/20 shrink-0" />
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium capitalize line-clamp-2 leading-snug text-white">{e.product_title ?? e.target_label}</p>
              <p className="text-xs text-white/60">
                {e.product_price && <span className="font-semibold text-white">{e.product_price}</span>}
                {e.product_price && e.buy_url && " · "}
                {e.buy_url && storeName(e.buy_url)}
              </p>
            </div>

            {e.buy_url && (
              <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-1.5 rounded-full bg-white/90 text-[var(--foreground)] text-xs font-medium px-3 py-1.5 hover:bg-white transition-colors shrink-0">
                <ExternalLink className="h-3.5 w-3.5" /> View
              </a>
            )}
          </div>
        ))}

        {priced > 0 && (
          <div className="flex items-center justify-between border-t border-white/15 pt-3">
            <span className="text-sm">
              <span className="font-semibold text-white">{items.length}</span>
              <span className="text-white/60"> item{items.length === 1 ? "" : "s"} · </span>
              <span className="font-semibold text-white">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
