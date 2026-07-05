"use client";

import { Search, ShoppingBag, Replace } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, ProductCard, shopSummary, storeName } from "./ui";

/**
 * Exactly what's actually IN the currently displayed image — real products with a buy link,
 * plus a compact card for any inspo-only item (an uploaded photo, no product link yet). This
 * is deliberately NOT a search-results list: alternatives for an inspo item live behind its
 * "Find buyable matches" button (opens SimilarItemsPanel, pre-populated from the deferred
 * post-generate search — see the search kickoff in generate()) so this panel always reads as
 * "here's your room," not "here's what we found."
 */
export default function ShopLook({ ws }: { ws: RestyleWorkspace }) {
  const { productEdits, inspoEdits } = ws;
  const { total, priced: pricedCount } = shopSummary(productEdits);

  if (productEdits.length === 0 && inspoEdits.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-[var(--foreground)]" />
          <p className="text-sm font-semibold">Shop this look</p>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Nothing to shop in this version yet — swap or add a piece and it&apos;ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-[var(--foreground)]" />
        <p className="text-sm font-semibold">Shop this look</p>
      </div>

      {productEdits.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {productEdits.length} item{productEdits.length === 1 ? "" : "s"} shoppable
            {pricedCount > 0 && <> · from <span className="font-semibold text-[var(--foreground)]">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}
          </p>
          {productEdits.map((e) => (
            <ProductCard key={e.id}
              image={e.reference_url}
              title={e.product_title ?? e.target_label ?? "Item"}
              retailer={e.buy_url ? storeName(e.buy_url) : null}
              price={e.product_price}
              viewUrl={e.buy_url}>
              <Button size="sm" variant="subtle" className="mt-1"
                onClick={() => ws.openSimilar(e.target_label ?? "item", e.kind === "add" ? "add" : "swap", e.id)}>
                <Replace className="h-3.5 w-3.5" /> Replace
              </Button>
            </ProductCard>
          ))}
        </div>
      )}

      {inspoEdits.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--border)] first:border-t-0 first:pt-0">
          {inspoEdits.map((e) => (
            <ProductCard key={e.id}
              image={e.reference_url}
              title={e.target_label ?? "Item"}
              retailer="From your photo">
              <Button size="sm" variant="accentSoft" className="mt-1"
                onClick={() => ws.openSimilar(e.target_label ?? "item", e.kind === "add" ? "add" : "swap", e.id)}>
                <Search className="h-3.5 w-3.5" /> Find buyable matches
              </Button>
            </ProductCard>
          ))}
        </div>
      )}
    </div>
  );
}
