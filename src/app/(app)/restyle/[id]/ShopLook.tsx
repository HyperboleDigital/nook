"use client";

import { ShoppingBag, Replace } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, ProductCard, storeName } from "./ui";

const parsePrice = (p: string | null | undefined) => {
  const n = Number(String(p ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export default function ShopLook({ ws }: { ws: RestyleWorkspace }) {
  const { productEdits } = ws;
  const total = productEdits.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const pricedCount = productEdits.filter((e) => e.product_price).length;

  return (
    <div className="border border-[var(--border)] bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-[var(--foreground)]" />
        <p className="text-sm font-semibold">Shop this look</p>
      </div>
      {productEdits.length > 0 ? (
        <>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {productEdits.length} item{productEdits.length === 1 ? "" : "s"} in this version
            {pricedCount > 0 && <> · from <span className="font-semibold text-[var(--foreground)]">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}
          </p>
          <div className="space-y-2">
            {productEdits.map((e) => (
              <ProductCard key={e.id}
                image={e.reference_url}
                title={e.product_title ?? e.target_label ?? "Item"}
                retailer={e.buy_url ? storeName(e.buy_url) : null}
                price={e.product_price}
                viewUrl={e.buy_url}>
                <Button size="sm" variant="subtle" className="mt-1"
                  onClick={() => ws.openSourcing(e.target_label ?? "item", e.kind === "add" ? "add" : "swap")}>
                  <Replace className="h-3.5 w-3.5" /> Replace
                </Button>
              </ProductCard>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Nothing to shop in this version yet — swap or add a piece and it&apos;ll show up here.
        </p>
      )}
    </div>
  );
}
