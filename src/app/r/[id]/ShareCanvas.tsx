"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ExternalLink, Sparkles, ShoppingBag, X } from "lucide-react";
import { Button, ProductCard, storeName } from "@/app/(studio)/restyle/[id]/ui";
import { actionIcon, anchorFor, declutter, HotspotMarker, HotspotRegion, toBox } from "@/app/(studio)/restyle/[id]/hotspot-visuals";
import type { DetectedObject, RestyleEdit } from "@/types";

export type ShareHotspot = { label: string; box_2d: DetectedObject["box_2d"]; edit: RestyleEdit };

const parsePrice = (p: string | null) => { const n = Number(String(p ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

/**
 * Full-viewport, read-only mirror of the editor's immersive canvas (see `(studio)/restyle/[id]/
 * RestyleCanvas.tsx` for the original) — same measured-pixel-box technique for shrink-wrapping a
 * portrait photo without letterboxing, same highlighted-region hotspots (`HotspotRegion`/
 * `HotspotMarker`/`actionIcon`, shared with the studio's `ObjectHotspots.tsx` via
 * `hotspot-visuals.tsx` so the two can't visually drift apart), but no edit actions: a tap just
 * opens an info/Buy popover, there's no Show similar / toggle / sourcing. `hotspots` is empty
 * whenever nothing has ever been generated (current_url === original_url — see page.tsx), so the
 * "never show placed UI on the unedited photo" rule holds here too.
 */
export default function ShareCanvas({
  imageUrl, width, height, title, hotspots, edits,
}: {
  imageUrl: string;
  width: number | null;
  height: number | null;
  title: string | null;
  hotspots: ShareHotspot[];
  edits: RestyleEdit[];
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

  // "Shop this look" is deliberately product-only — a real, buyable item with a resolved
  // buy_url. A swap/add sourced from a photo or description with nothing resolved yet, or a
  // removal, is a real change to the room (it still gets a hotspot on the photo — see
  // renderHotspots below) but isn't something to shop, so it doesn't belong in this list. This
  // was a deliberate product decision, not an oversight — don't re-add a catch-all "everything
  // else" section here without checking with the user first.
  const products = edits.filter((e) => e.buy_url);
  const total = products.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const priced = products.filter((e) => e.product_price).length;

  // With nothing shoppable yet, a "Shop this look" heading over an empty state reads as a
  // broken promise — the panel led with a CTA nobody could act on. Swap the whole panel for a
  // real call-to-action instead: no "Shop this look" label at all when there's nothing to shop.
  const shopPanel = products.length > 0 ? (
    <div className="bg-[var(--card)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-[var(--foreground)]" />
        <p className="text-sm font-semibold">Shop this look</p>
      </div>
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
    </div>
  ) : (
    <div className="bg-[var(--card)] p-6 text-center space-y-3">
      <div className="h-12 w-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mx-auto">
        <Sparkles className="h-5 w-5 text-[var(--accent-soft-foreground)]" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Like what you see?</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Upload a photo of your own room and get a design like this in minutes.
        </p>
      </div>
      <Link href="/restyle/new">
        <Button variant="primary" className="w-full">Try this design →</Button>
      </Link>
      {/* "Try this design" links to a blank /restyle/new — it doesn't actually clone THIS room's
          specific edits onto yours, so it reads as "try this experience," not "recreate this
          exact look." This line makes that explicit: it's a fresh start on the viewer's OWN
          room, not a preset applied to it. */}
      <p className="text-[11px] text-[var(--muted-foreground)]">
        Start your own room restyle — completely from scratch.
      </p>
    </div>
  );

  const renderHotspots = () => {
    const boxes = hotspots.map((h) => toBox(h.box_2d));
    const markers = declutter(boxes.map((b) => anchorFor(b, boxes)));
    const order = hotspots.map((_, i) => i).sort((a, b) => boxes[b].area - boxes[a].area);
    return order.map((i) => {
      const h = hotspots[i];
      const b = boxes[i];
      const m = markers[i];
      const isActive = openHotspot?.label.toLowerCase() === h.label.toLowerCase();
      return (
        <Fragment key={`${h.label}-${i}`}>
          <HotspotRegion box={b} label={h.label} isActive={isActive}
            ariaLabel={`${h.label} (${h.edit.buy_url ? "shop this" : "added"})`}
            onClick={() => setOpenHotspot({ label: h.label, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, edit: h.edit })} />
          <span className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}>
            <HotspotMarker bg="bg-[var(--accent)]" icon={actionIcon(h.edit, "h-3.5 w-3.5 text-white")} />
          </span>
        </Fragment>
      );
    });
  };

  const popover = (widthClass: string, thumbClass: string, halfWidthPx: number) => openHotspot && (
    <div className={`absolute z-10 ${widthClass} rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-pop)]`}
      style={{
        left: `clamp(${halfWidthPx}px, ${openHotspot.cx}%, calc(100% - ${halfWidthPx}px))`,
        top: openHotspot.cy <= 50 ? `${Math.min(openHotspot.cy + 5, 90)}%` : undefined,
        bottom: openHotspot.cy > 50 ? `${Math.min(100 - openHotspot.cy + 5, 90)}%` : undefined,
        transform: "translateX(-50%)",
      }}>
      <div className="flex items-start gap-3 p-3">
        {openHotspot.edit.reference_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={openHotspot.edit.reference_url} alt="" className={`${thumbClass} object-cover rounded-xl border border-[var(--border)] shrink-0`} />
        ) : (
          <span className={`${thumbClass} rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0 flex items-center justify-center text-[var(--muted-foreground)]`}>
            {actionIcon(openHotspot.edit, "h-4 w-4")}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold capitalize leading-snug">{openHotspot.edit.product_title ?? openHotspot.label}</p>
          {openHotspot.edit.buy_url ? (
            <>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {openHotspot.edit.product_price ?? "See price"} · {storeName(openHotspot.edit.buy_url)}
              </p>
              <a href={openHotspot.edit.buy_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline">
                Buy <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {openHotspot.edit.kind === "add" ? "Added to this room" : "Swapped in this room"}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setOpenHotspot(null)} aria-label="Close"
          className="relative h-6 w-6 shrink-0 -mt-1 -mr-1 flex items-center justify-center rounded-full hover:bg-[var(--muted)] before:absolute before:-inset-1.5 before:rounded-full before:content-['']">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-dvh flex flex-col">
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--card)]">
        <Link href="/" className="font-bold tracking-tight text-sm">Nook</Link>
        <Link href="/restyle/new">
          <Button variant="primary" size="sm">Try this design →</Button>
        </Link>
      </header>

      {/* Desktop immersive stage — a REAL docked flex row, same as the editor's RestyleStudio.tsx,
          not an absolute overlay: a floating panel on top of the stage would sit on top of real
          hotspots near the right edge (untappable) and, on a landscape photo close to the stage's
          own aspect ratio, visibly overlap the image with little or no gutter to float in. Docking
          it as a sibling column means the stage's own measured width naturally excludes the rail. */}
      <div className="hidden md:flex flex-1 min-h-0">
        <div ref={frameRef} className="relative flex-1 min-w-0 h-full bg-[var(--muted)] flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover blur-2xl brightness-50 scale-110" />
          <div className={imgWrapClass} style={imgBoxStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={title ?? "Room design"} className={imgClass} onLoad={onImgLoad} />
            {renderHotspots()}
            {popover("w-64", "h-14 w-14", 128)}
          </div>
        </div>
        <div className="w-[380px] shrink-0 border-l border-[var(--border)] bg-white overflow-y-auto">
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
            {renderHotspots()}
            {popover("w-56 max-w-[80vw]", "h-12 w-12", 112)}
          </div>
          {/* The editor has an equivalent hint below its canvas; the share page's dots had no
              such affordance — a first-time viewer had no hint the small markers were tappable. */}
          {hotspots.length > 0 && (
            <p className="text-[11px] text-[var(--muted-foreground)] text-center">
              Tap an item to see what changed
            </p>
          )}
          {shopPanel}
        </div>
      </div>
    </div>
  );
}
