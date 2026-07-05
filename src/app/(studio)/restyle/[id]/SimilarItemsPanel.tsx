"use client";

import { useEffect } from "react";
import { Sparkles, ShoppingCart } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { Button, SkeletonProductCard, Spinner, StatusBanner } from "./ui";
import CroppedThumb from "./CroppedThumb";

/**
 * Clean list of alternative products for ANY detected item — whether it already has something
 * staged/placed (searches off that reference photo) or has never been touched at all (searches
 * off the ORIGINAL photo cropped to the item's own detected box, via `box2d` — see
 * useRestyleWorkspace's `runVisualSearchByUrl` and the visual-search route). "Find similar"
 * shouldn't require swapping something first. Deliberately just the results, no link/photo/
 * describe tabs: that composing form is for sourcing an EMPTY slot from scratch, a different job.
 */
export default function SimilarItemsPanel({ ws }: { ws: RestyleWorkspace }) {
  const sourcing = ws.sourcing;
  const label = sourcing?.label ?? "";
  const key = label.toLowerCase();
  const search = ws.searches[key] ?? { status: "idle" as const, scored: false, results: [] };
  const stagedEdit = ws.stagedItems.find((e) => e.target_label?.toLowerCase() === key) ?? null;
  const detected = ws.objects.find((o) => o.label.toLowerCase() === key) ?? null;

  // Kick off a search if this slot hasn't been searched yet. Prefers an already-staged
  // photo/product's own image (no re-upload needed); otherwise falls back to the ORIGINAL
  // photo cropped to the detected item's box, so a never-touched item can still be searched.
  useEffect(() => {
    if (!sourcing || sourcing.view !== "similar") return;
    if (search.status !== "idle") return;
    if (stagedEdit?.reference_url) { ws.runVisualSearchByUrl(stagedEdit.reference_url, key); return; }
    if (detected && ws.restyle) ws.runVisualSearchByUrl(ws.restyle.original_url, key, detected.box_2d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcing?.label, sourcing?.view]);

  if (!sourcing) return null;

  // `idle` here means "the search is about to fire" (the effect above runs right after mount) —
  // treat it as loading so the panel never shows a blank flash before the skeletons appear, but
  // only when there's actually something to search from (otherwise idle would spin forever).
  const willSearch = !!(stagedEdit?.reference_url || detected);
  const loading = search.status === "loading" || (search.status === "idle" && willSearch);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {stagedEdit?.reference_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={stagedEdit.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-[var(--border)] bg-[var(--muted)] shrink-0" />
        ) : detected && ws.restyle ? (
          <CroppedThumb imageUrl={ws.restyle.original_url} box_2d={detected.box_2d}
            className="h-14 w-14 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--muted)] shrink-0" />
        ) : null}
        <p className="text-xs text-[var(--muted-foreground)]">
          Recommended based on <span className="font-medium text-[var(--foreground)] capitalize">{stagedEdit?.product_title ?? label}</span>
        </p>
      </div>

      {loading && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <Spinner size="xs" className="text-[var(--accent)]" /> Finding similar items — this can take a few seconds…
          </p>
          <SkeletonProductCard /><SkeletonProductCard /><SkeletonProductCard />
        </div>
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
    <div className="flex gap-3 p-3 rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]">
      {c.thumbnail ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={c.thumbnail} alt="" className="h-16 w-16 object-cover rounded-xl border border-[var(--border)] shrink-0" />
      ) : (
        <div className="h-16 w-16 rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0" />
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
          <Button size="sm" variant={inUse ? "subtle" : "accentSoft"} disabled={!c.supported || picking || inUse} onClick={onTry} className="flex-1">
            {picking ? <Spinner size="xs" className="text-current" /> : <Sparkles className="h-3.5 w-3.5" />}
            {inUse ? "In use" : picking ? "Trying…" : "Try on photo"}
          </Button>
          {(c.productUrl ?? c.alternates?.[0]?.url) && (
            <a href={c.productUrl ?? c.alternates?.[0]?.url ?? undefined} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="accent" aria-label="Buy" className="rounded-full h-8 w-8 p-0"><ShoppingCart className="h-3.5 w-3.5" /></Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
