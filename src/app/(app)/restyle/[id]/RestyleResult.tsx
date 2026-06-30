"use client";

import { useState } from "react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { card, sectionLabel } from "./shared";

/**
 * The default post-render view — the agent's deliverable. A big before/after slider of
 * the viewed render, "Shop this look" (products mapped to *that* render via its signature),
 * an options strip to switch between renders, and actions to download / edit / branch a new
 * option. Re-entering the guided flow is delegated up to the page shell.
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

  // Before/after comparison is opt-in — default view is just the result.
  const [showCompare, setShowCompare] = useState(false);

  if (!restyle) return null;
  const viewingOriginal = displayUrl === restyle.original_url;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Canvas */}
      <div className="relative rounded-2xl overflow-hidden bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center p-2">
        {viewingOriginal ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={restyle.original_url} alt="Original" className="block max-w-full max-h-[68vh] object-contain rounded-lg" />
        ) : !showCompare ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={displayUrl} alt="Restyled room" className="block max-w-full max-h-[68vh] object-contain rounded-lg" />
        ) : (
          <div ref={imgWrapRef} className="relative select-none max-h-[68vh] inline-block touch-none" {...sliderHandlers}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="After" className="block max-h-[68vh] w-auto max-w-full object-contain rounded-lg" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restyle.original_url} alt="Before" draggable={false}
              className="absolute inset-0 h-full w-full object-contain rounded-lg"
              style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)] pointer-events-none" style={{ left: `${compare}%` }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 text-xs">⇆</div>
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
            <button type="button" onClick={() => setShowCompare(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm border shadow-sm transition-colors ${
                showCompare ? "bg-slate-900 text-white border-slate-900" : "bg-white/90 text-slate-600 hover:text-slate-900 border-[var(--border)]"
              }`}>
              ⇆ Compare
            </button>
          )}
          <button type="button" onClick={downloadImage}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-slate-600 hover:text-slate-900 border border-[var(--border)] shadow-sm transition-colors">
            ↓ Save
          </button>
        </div>
      </div>

      {/* Primary actions — keep refining this result, or start over from the bare photo */}
      <div className="flex gap-2">
        <button type="button" onClick={onEditThis} disabled={generating}
          className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold py-3 rounded-xl text-sm hover:opacity-90 disabled:opacity-30 transition-opacity">
          Edit this room
        </button>
        <button type="button" onClick={onEditOriginal} disabled={generating}
          className="flex-1 border border-[var(--border)] font-medium py-3 rounded-xl text-sm text-slate-700 hover:border-slate-400 disabled:opacity-30 transition-colors">
          Edit original
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2">{error}</div>
      )}

      {/* In this room — products in the viewed render only */}
      {productEdits.length > 0 && (
        <div className={`${card} p-4 space-y-2.5`}>
          <p className={sectionLabel}>In this room</p>
          {productEdits.map(e => (
            <div key={e.id} className="flex items-center gap-3">
              {e.reference_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={e.reference_url} alt="" className="h-12 w-12 rounded-lg object-cover border border-[var(--border)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800 truncate">{e.product_title ?? e.target_label}</p>
                {e.product_price && <p className="text-xs text-[var(--muted-foreground)]">{e.product_price}</p>}
              </div>
              <a href={e.buy_url ?? "#"} target="_blank" rel="noopener noreferrer"
                className="bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity shrink-0">
                Buy ↗
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Options — each render is a switchable option; products follow the selection */}
      {renders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className={sectionLabel}>Options</p>
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
                <button key={r.id} type="button" onClick={() => setPreviewUrl(r.image_url)} title={`Option ${i + 1}`}
                  className={`relative shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-colors ${
                    isViewed ? "border-slate-900" : "border-[var(--border)] hover:border-slate-400"
                  }`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.image_url} alt={`Option ${i + 1}`} className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 text-[7px] text-center bg-black/60 text-white py-0.5">Option {i + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
