"use client";

import { useEffect } from "react";
import { Sparkles, ShoppingCart } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { Button, SkeletonProductCard, Spinner, StatusBanner } from "./ui";

/**
 * Clean list of alternative products for a slot that already has something placed — the
 * "Show similar" destination. Deliberately just the results, no link/photo/describe tabs:
 * that composing form is for sourcing an EMPTY slot from scratch, a different job.
 */
export default function SimilarItemsPanel({ ws }: { ws: RestyleWorkspace }) {
  const sourcing = ws.sourcing;
  const label = sourcing?.label ?? "";
  const key = label.toLowerCase();
  const search = ws.searches[key] ?? { status: "idle" as const, scored: false, results: [] };
  const stagedEdit = ws.stagedItems.find((e) => e.target_label?.toLowerCase() === key) ?? null;

  // Kick off a search if this slot hasn't been searched yet — reuses the already-staged
  // photo/product's own image rather than asking the user to upload anything again.
  useEffect(() => {
    if (!sourcing || sourcing.view !== "similar") return;
    if (search.status !== "idle") return;
    const url = stagedEdit?.reference_url;
    if (url) ws.runVisualSearchByUrl(url, key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcing?.label, sourcing?.view]);

  if (!sourcing) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Recommended based on <span className="font-medium text-[var(--foreground)] capitalize">{stagedEdit?.product_title ?? label}</span>
      </p>

      {search.status === "loading" && (
        <div className="space-y-2"><SkeletonProductCard /><SkeletonProductCard /><SkeletonProductCard /></div>
      )}
      {search.status === "error" && <StatusBanner variant="error">{search.error}</StatusBanner>}
      {search.status === "ready" && search.results.length === 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">No similar products found.</p>
      )}
      {search.status === "ready" && search.results.map((c, i) => {
        const pickKey = `similar:${key}:${i}`;
        const picking = ws.pickingKey === pickKey;
        const inUse = stagedEdit?.buy_url && c.productUrl === stagedEdit.buy_url;
        return <SimilarCard key={i} c={c} picking={picking} inUse={!!inUse}
          onTry={() => ws.pickCandidate(c as ShoppingResult, label, pickKey, sourcing.stagedEditId ?? undefined)} />;
      })}
    </div>
  );
}

function SimilarCard({ c, picking, inUse, onTry }: { c: ShoppingResult; picking: boolean; inUse: boolean; onTry: () => void }) {
  return (
    <div className="flex gap-3 p-3 border border-[var(--border)] bg-white">
      {c.thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={c.thumbnail} alt="" className="h-16 w-16 object-cover border border-[var(--border)] shrink-0" />
      ) : (
        <div className="h-16 w-16 bg-[var(--muted)] border border-[var(--border)] shrink-0" />
      )}
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium line-clamp-2 leading-snug">{c.title}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {c.retailer}
          {(c.productUrl ?? c.alternates?.[0]?.url) && (
            <> · <a href={c.productUrl ?? c.alternates?.[0]?.url ?? undefined} target="_blank" rel="noopener noreferrer"
              className="underline hover:text-[var(--foreground)]">Link to product</a></>
          )}
        </p>
        {c.price && <p className="text-sm font-bold">{c.price}</p>}
        <div className="flex gap-2 pt-1.5">
          <Button size="sm" variant={inUse ? "subtle" : "outline"} disabled={!c.supported || picking || inUse} onClick={onTry} className="flex-1">
            {picking ? <Spinner size="xs" className="text-current" /> : <Sparkles className="h-3.5 w-3.5" />}
            {inUse ? "In use" : picking ? "Trying…" : "Try on photo"}
          </Button>
          {(c.productUrl ?? c.alternates?.[0]?.url) && (
            <a href={c.productUrl ?? c.alternates?.[0]?.url ?? undefined} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="primary" aria-label="Buy"><ShoppingCart className="h-3.5 w-3.5" /></Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
