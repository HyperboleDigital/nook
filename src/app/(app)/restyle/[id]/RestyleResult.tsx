"use client";

import { useState } from "react";
import { Columns2, Download, Pencil, RotateCcw, ShoppingBag, ArrowLeftRight } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { card, sectionLabel } from "./shared";
import { Button, IconButton, ProductCard, storeName } from "./ui";

const parsePrice = (p: string | null | undefined) => {
  const n = Number(String(p ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The default post-render view — the agent's deliverable. A clean room canvas beside a
 * "Shop this look" product panel (products mapped to the viewed render via its signature),
 * with an options strip to switch renders and actions to edit / start over.
 */
export default function RestyleResult({
  ws, onEditThis, onEditOriginal,
}: {
  ws: RestyleWorkspace;
  onEditThis: () => void;
  onEditOriginal: () => void;
}) {
  const {
    restyle, renders, generating, error,
    compare, imgWrapRef, sliderHandlers, displayUrl, previewUrl, setPreviewUrl,
    productEdits, downloadImage,
  } = ws;

  const [showCompare, setShowCompare] = useState(false);

  if (!restyle) return null;
  const viewingOriginal = displayUrl === restyle.original_url;

  const total = productEdits.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const pricedCount = productEdits.filter(e => e.product_price).length;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">

        {/* ── Canvas + actions ── */}
        <div className="w-full lg:flex-1 min-w-0 space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center p-2">
            {viewingOriginal ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={restyle.original_url} alt="Original" className="block max-w-full max-h-[70vh] object-contain rounded-lg" />
            ) : !showCompare ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={displayUrl} alt="Restyled room" className="block max-w-full max-h-[70vh] object-contain rounded-lg" />
            ) : (
              <div ref={imgWrapRef} className="relative select-none max-h-[70vh] inline-block touch-none" {...sliderHandlers}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={displayUrl} alt="After" className="block max-h-[70vh] w-auto max-w-full object-contain rounded-lg" draggable={false} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={restyle.original_url} alt="Before" draggable={false}
                  className="absolute inset-0 h-full w-full object-contain rounded-lg"
                  style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)] pointer-events-none" style={{ left: `${compare}%` }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </div>
                </div>
                <span className="absolute bottom-3 left-3 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white">Before</span>
                <span className="absolute bottom-3 right-3 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white">After</span>
              </div>
            )}

            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
                <span className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
                <span className="text-sm text-slate-600">Generating your room…</span>
              </div>
            )}

            <div className="absolute top-3 right-3 flex gap-2">
              {!viewingOriginal && (
                <IconButton onClick={() => setShowCompare(v => !v)} aria-label="Compare before / after"
                  className={showCompare ? "bg-slate-900 text-white border-slate-900 hover:text-white" : ""}>
                  <Columns2 className="h-4 w-4" />
                </IconButton>
              )}
              <IconButton onClick={downloadImage} aria-label="Download image">
                <Download className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" onClick={onEditThis} disabled={generating}>
              <Pencil className="h-4 w-4" /> Edit this room
            </Button>
            <Button variant="outline" size="lg" className="flex-1" onClick={onEditOriginal} disabled={generating}>
              <RotateCcw className="h-4 w-4" /> Edit original
            </Button>
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2">{error}</div>}

          {/* Options — switch between renders */}
          {renders.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>Versions</p>
                {previewUrl && (
                  <button type="button" onClick={() => setPreviewUrl(null)}
                    className="text-[11px] text-[var(--muted-foreground)] hover:text-slate-700 underline transition-colors">
                    Latest
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setPreviewUrl(restyle.original_url)} title="Original"
                  className={`relative shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-colors ${
                    previewUrl === restyle.original_url ? "border-slate-900" : "border-[var(--border)] hover:border-slate-400"
                  }`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={restyle.original_url} alt="Original" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 text-[7px] text-center bg-black/60 text-white py-0.5">Original</span>
                </button>
                {renders.map((r, i) => {
                  const isViewed = previewUrl ? previewUrl === r.image_url : r.image_url === restyle.current_url;
                  return (
                    <button key={r.id} type="button" onClick={() => setPreviewUrl(r.image_url)} title={`Version ${i + 1}`}
                      className={`relative shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-colors ${
                        isViewed ? "border-slate-900" : "border-[var(--border)] hover:border-slate-400"
                      }`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.image_url} alt={`Version ${i + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 text-[7px] text-center bg-black/60 text-white py-0.5">v{i + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Shop this look ── */}
        <div className="w-full lg:w-96 lg:shrink-0 lg:sticky lg:top-4">
          <div className={`${card} p-4 space-y-3`}>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-slate-700" />
              <p className="text-sm font-semibold text-slate-800">Shop this look</p>
            </div>
            {productEdits.length > 0 ? (
              <>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {productEdits.length} item{productEdits.length === 1 ? "" : "s"} in this version
                  {pricedCount > 0 && <> · from <span className="font-semibold text-slate-700">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}
                </p>
                <div className="space-y-2">
                  {productEdits.map(e => (
                    <ProductCard key={e.id}
                      image={e.reference_url}
                      title={e.product_title ?? e.target_label ?? "Item"}
                      retailer={e.buy_url ? storeName(e.buy_url) : null}
                      price={e.product_price}
                      viewUrl={e.buy_url}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                Nothing to shop in this version yet. Add a product from the guided flow and it&apos;ll show up here.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
