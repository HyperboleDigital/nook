"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ShoppingBag, ExternalLink, X } from "lucide-react";
import { ProductCard, storeName } from "@/app/(studio)/restyle/[id]/ui";
import type { DetectedObject, RestyleEdit } from "@/types";

export type ShareHotspot = { label: string; box_2d: DetectedObject["box_2d"]; edit: RestyleEdit };

const parsePrice = (p: string | null) => { const n = Number(String(p ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

/**
 * Full-viewport, read-only mirror of the editor's immersive canvas (see `(studio)/restyle/[id]/
 * RestyleCanvas.tsx` for the original) — same measured-pixel-box technique for shrink-wrapping
 * a portrait photo without letterboxing, same tap-a-hotspot interaction, but no edit actions:
 * a tap just opens a thumbnail/price/Buy popover, there's no Show similar / toggle / sourcing.
 * `hotspots` is empty whenever nothing has ever been generated (current_url === original_url —
 * see page.tsx), so the "never show placed UI on the unedited photo" rule holds here too.
 */
export default function ShareCanvas({
  imageUrl, width, height, title, hotspots, products,
}: {
  imageUrl: string;
  width: number | null;
  height: number | null;
  title: string | null;
  hotspots: ShareHotspot[];
  products: RestyleEdit[];
}) {
  const [openHotspot, setOpenHotspot] = useState<{ label: string; cx: number; cy: number; edit: RestyleEdit } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  // Measured directly off the rendered <img> — more robust than trusting the `width`/`height`
  // props alone (see RestyleCanvas.tsx's identical comment for why).
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (t.naturalWidth && t.naturalHeight) setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
  };

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      setFrameSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const natW = naturalSize?.w || width || 0;
  const natH = naturalSize?.h || height || 0;
  let imgBoxStyle: CSSProperties | undefined;
  if (isDesktop && natW && natH && frameSize.w && frameSize.h) {
    const scale = Math.min(frameSize.w / natW, frameSize.h / natH);
    const w = natW * scale, h = natH * scale;
    imgBoxStyle = { position: "absolute", left: (frameSize.w - w) / 2, top: (frameSize.h - h) / 2, width: w, height: h };
  }
  const imgWrapClass = imgBoxStyle
    ? "relative rounded-3xl overflow-hidden shadow-[var(--shadow-pop)]"
    : "relative block w-full rounded-3xl overflow-hidden shadow-[var(--shadow-pop)]";
  const imgClass = imgBoxStyle ? "block w-full h-full object-cover" : "block w-full h-auto max-h-[85dvh] object-contain";

  const total = products.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const priced = products.filter((e) => e.product_price).length;

  const shopPanel = (
    <div className="bg-[var(--card)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-[var(--foreground)]" />
        <p className="text-sm font-semibold">Shop this look</p>
      </div>
      {products.length > 0 ? (
        <>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            {products.length} item{products.length === 1 ? "" : "s"}
            {priced > 0 && <> · from <span className="font-semibold text-[var(--foreground)]">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}
          </p>
          <div className="space-y-2">
            {products.map((e) => (
              <ProductCard key={e.id} image={e.reference_url} title={e.product_title ?? e.target_label ?? "Item"}
                retailer={storeName(e.buy_url)} price={e.product_price} viewUrl={e.buy_url}>
                {e.buy_url && (
                  <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline mt-1">
                    View on {storeName(e.buy_url)} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </ProductCard>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">No shoppable products in this design.</p>
      )}
    </div>
  );

  return (
    <div className="h-dvh flex flex-col">
      <header className="h-12 shrink-0 flex items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--card)]">
        <Link href="/" className="font-bold tracking-tight text-sm">Nook</Link>
        <Link href="/" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Design your own →</Link>
      </header>

      {/* Desktop immersive stage */}
      <div className="hidden md:block relative flex-1 min-h-0">
        <div ref={frameRef} className="relative h-full w-full bg-[var(--muted)] flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover blur-2xl brightness-50 scale-110" />
          <div className={imgWrapClass} style={imgBoxStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={title ?? "Room design"} className={imgClass} onLoad={onImgLoad} />
            {hotspots.map((h, i) => {
              const [ymin, xmin, ymax, xmax] = h.box_2d;
              const cx = (xmin + xmax) / 2 / 10, cy = (ymin + ymax) / 2 / 10;
              return (
                <button key={`${h.label}-${i}`} type="button"
                  onClick={() => setOpenHotspot({ label: h.label, cx, cy, edit: h.edit })}
                  className="absolute -translate-x-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center group"
                  style={{ left: `${cx}%`, top: `${cy}%` }} aria-label={`Shop the ${h.label}`}>
                  <span className="h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShoppingBag className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
            {openHotspot && (
              <div className="absolute z-10 w-64 rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]"
                style={{
                  left: `clamp(128px, ${openHotspot.cx}%, calc(100% - 128px))`,
                  top: openHotspot.cy <= 50 ? `${Math.min(openHotspot.cy + 5, 90)}%` : undefined,
                  bottom: openHotspot.cy > 50 ? `${Math.min(100 - openHotspot.cy + 5, 90)}%` : undefined,
                  transform: "translateX(-50%)",
                }}>
                <div className="flex items-start gap-3 p-3">
                  {openHotspot.edit.reference_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={openHotspot.edit.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-[var(--border)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-semibold capitalize leading-snug">{openHotspot.edit.product_title ?? openHotspot.label}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      {openHotspot.edit.product_price ?? "See price"} · {storeName(openHotspot.edit.buy_url)}
                    </p>
                    {openHotspot.edit.buy_url && (
                      <a href={openHotspot.edit.buy_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline">
                        Buy <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <button type="button" onClick={() => setOpenHotspot(null)} aria-label="Close"
                    className="h-6 w-6 shrink-0 -mt-1 -mr-1 flex items-center justify-center rounded-full hover:bg-[var(--muted)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="absolute right-4 top-4 bottom-4 w-[360px] rounded-3xl bg-white shadow-[var(--shadow-pop)] border border-[var(--border)] overflow-y-auto">
          {title && <p className="px-4 pt-4 text-sm font-semibold">{title}</p>}
          {shopPanel}
        </div>
      </div>

      {/* Mobile — stacked column */}
      <div className="md:hidden flex-1 overflow-y-auto">
        <div className="p-3 space-y-3">
          {title && <h1 className="text-lg font-bold tracking-tight">{title}</h1>}
          <div className="relative rounded-3xl border border-[var(--border)] bg-[var(--muted)] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={title ?? "Room design"} className="block w-full h-auto object-contain" />
            {hotspots.map((h, i) => {
              const [ymin, xmin, ymax, xmax] = h.box_2d;
              const cx = (xmin + xmax) / 2 / 10, cy = (ymin + ymax) / 2 / 10;
              return (
                <button key={`${h.label}-${i}`} type="button"
                  onClick={() => setOpenHotspot({ label: h.label, cx, cy, edit: h.edit })}
                  className="absolute -translate-x-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center"
                  style={{ left: `${cx}%`, top: `${cy}%` }} aria-label={`Shop the ${h.label}`}>
                  <span className="h-6 w-6 rounded-full bg-[var(--accent)] border-2 border-white shadow-[var(--shadow-soft)] flex items-center justify-center">
                    <ShoppingBag className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
            {openHotspot && (
              <div className="absolute z-10 w-56 max-w-[80vw] rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]"
                style={{
                  left: `clamp(112px, ${openHotspot.cx}%, calc(100% - 112px))`,
                  top: openHotspot.cy <= 50 ? `${Math.min(openHotspot.cy + 5, 90)}%` : undefined,
                  bottom: openHotspot.cy > 50 ? `${Math.min(100 - openHotspot.cy + 5, 90)}%` : undefined,
                  transform: "translateX(-50%)",
                }}>
                <div className="flex items-start gap-3 p-3">
                  {openHotspot.edit.reference_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={openHotspot.edit.reference_url} alt="" className="h-12 w-12 object-cover rounded-xl border border-[var(--border)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-xs font-semibold capitalize leading-snug">{openHotspot.edit.product_title ?? openHotspot.label}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      {openHotspot.edit.product_price ?? "See price"} · {storeName(openHotspot.edit.buy_url)}
                    </p>
                    {openHotspot.edit.buy_url && (
                      <a href={openHotspot.edit.buy_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline">
                        Buy <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <button type="button" onClick={() => setOpenHotspot(null)} aria-label="Close"
                    className="h-6 w-6 shrink-0 -mt-1 -mr-1 flex items-center justify-center rounded-full hover:bg-[var(--muted)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
          {shopPanel}
        </div>
      </div>
    </div>
  );
}
