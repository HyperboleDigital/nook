"use client";

import { ShoppingBag, Replace } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { Button, ProductCard, SkeletonProductCard, Spinner, StatusBanner, matchWord, shopSummary, storeName } from "./ui";

/**
 * Shoppable items in the current render, plus buyable options for any inspo-only items
 * (photos with no product link) — that search is deferred until here (right after generate)
 * instead of running the moment a photo was uploaded, when the user might still be deciding.
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

      {inspoEdits.map((e) => {
        const label = (e.target_label ?? "").toLowerCase();
        const search = ws.searches[label] ?? { status: "idle" as const, scored: false, results: [] };
        return (
          <div key={e.id} className="space-y-2 pt-2 border-t border-[var(--border)] first:border-t-0 first:pt-0">
            <p className="text-[11px] font-medium capitalize">{e.target_label} <span className="text-[var(--muted-foreground)] font-normal">— from your photo</span></p>
            {search.status === "loading" && <SkeletonProductCard />}
            {search.status === "error" && <StatusBanner variant="error">{search.error}</StatusBanner>}
            {search.status === "idle" && (
              <p className="text-xs text-[var(--muted-foreground)]">Looking for buyable matches…</p>
            )}
            {search.status === "ready" && search.results.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)]">No buyable matches found for this one.</p>
            )}
            {search.status === "ready" && search.results.slice(0, 3).map((c, i) => {
              const key = `shop:${label}:${i}`;
              const picking = ws.pickingKey === key;
              return (
                <ProductCard key={i}
                  image={c.thumbnail} title={c.title} retailer={c.retailer} price={c.price}
                  viewUrl={c.productUrl ?? c.alternates?.[0]?.url ?? null}
                  badge={matchWord(c.score, c.exact)}>
                  <Button size="sm" variant="accent" disabled={ws.pickingKey != null}
                    onClick={() => ws.pickCandidate(c as ShoppingResult, e.target_label ?? "", key, e.id)} className="mt-1">
                    {picking ? <><Spinner size="xs" className="text-current" /> Using…</> : "Use this instead"}
                  </Button>
                </ProductCard>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
