"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Eraser, ExternalLink, Plus, ShoppingBag, Sparkles } from "lucide-react";
import { Button, storeName } from "@/app/(studio)/restyle/[id]/ui";
import { actionIcon, anchorFor, declutter, HotspotLabel, HotspotMarker, toBox } from "@/app/(studio)/restyle/[id]/hotspot-visuals";
import Wordmark from "@/components/Wordmark";
import type { DetectedObject, RestyleEdit } from "@/types";

export type ShareHotspot = { label: string; box_2d: DetectedObject["box_2d"]; edit: RestyleEdit };

const parsePrice = (p: string | null) => { const n = Number(String(p ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

type Tone = "swap" | "add" | "remove";
const TONE: Record<Tone, { verb: string; cls: string }> = {
  swap: { verb: "Swapped", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  add: { verb: "Added", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  remove: { verb: "Removed", cls: "bg-red-50 text-red-700 border-red-200" },
};
function toneOf(e: RestyleEdit): Tone {
  return e.kind === "remove" ? "remove" : e.kind === "add" ? "add" : "swap";
}
function ChangeIcon({ e, className }: { e: RestyleEdit; className: string }) {
  if (e.kind === "remove") return <Eraser className={className} />;
  if (e.kind === "add") return <Plus className={className} />;
  return <ArrowLeftRight className={className} />;
}

/**
 * Public, read-only share view — a swipeable CARD WALKTHROUGH (the "story" direction), not the
 * editor's live canvas. The client opens a guided sequence: the room BEFORE → the room AFTER (with
 * markers showing what moved) → one card per change (swapped / added / removed, with a Buy link
 * when the piece is a real product) → a final "Shop this look" card. `hotspots` is empty whenever
 * nothing has been generated yet (current_url === original_url — see page.tsx), so the after card
 * shows no markers on an unedited photo. The before photo (`originalUrl`) is finally shown here —
 * the previous share page never had it.
 */
export default function ShareCanvas({
  imageUrl, originalUrl, title, hotspots, edits,
}: {
  imageUrl: string;
  originalUrl: string;
  width: number | null;
  height: number | null;
  title: string | null;
  hotspots: ShareHotspot[];
  edits: RestyleEdit[];
}) {
  const roomName = title?.trim() || "This room";
  const changes = edits.filter(
    (e) => (e.kind === "item" || e.kind === "add" || e.kind === "remove") && e.target_label,
  );
  const products = edits.filter((e) => e.buy_url);
  const total = products.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const priced = products.filter((e) => e.product_price).length;
  const hasRender = imageUrl !== originalUrl;

  // Active-dot tracking for the swipe indicator — index from scroll position (cheap, on scroll).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // before + after + one per change + shop-all (the after card only exists once there's a render).
  const stepCount = (hasRender ? 2 : 1) + changes.length + 1;
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const stride = el.clientWidth * 0.9;
    setActive(Math.max(0, Math.min(stepCount - 1, Math.round(el.scrollLeft / stride))));
  };

  // After-card markers — a reveal, so ALL labels show at once (unlike the editor, which shows a
  // label only on tap). Non-interactive; the per-change cards carry the shoppable detail.
  const boxes = hotspots.map((h) => toBox(h.box_2d));
  const anchors = declutter(boxes.map((b) => anchorFor(b, boxes)));

  return (
    <div className="h-dvh flex flex-col bg-[var(--background)]">
      <header className="h-14 shrink-0 flex items-center justify-between px-4">
        <Link href="/" aria-label="Nook home"><Wordmark className="text-xl" /></Link>
        <Link href="/restyle/new">
          <Button variant="primary" size="sm">Try this design →</Button>
        </Link>
      </header>

      <div className="px-4 pb-1 shrink-0">
        <h1 className="text-xl font-bold tracking-[-0.02em]">{roomName}</h1>
        <p className="text-xs text-[var(--muted-foreground)]">
          {hasRender ? "Swipe through the redesign →" : "Reimagined with Nook"}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 flex gap-3 overflow-x-auto snap-x snap-mandatory px-[5%] py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* BEFORE */}
        <WalkCard>
          <CardImage src={originalUrl} label="Before" labelCls="bg-black/55" />
          <div className="p-4">
            <p className="text-base font-bold tracking-tight">The room today</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">Where this space started.</p>
          </div>
        </WalkCard>

        {/* AFTER (only if something was generated) */}
        {hasRender && (
          <WalkCard>
            <div className="relative">
              <CardImage src={imageUrl} label={`After · ${changes.length} change${changes.length === 1 ? "" : "s"}`} labelCls="bg-[var(--accent)]" />
              {hotspots.map((h, i) => {
                const m = anchors[i];
                return (
                  <span key={`${h.label}-${i}`}
                    className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                    style={{ left: `${m.x}%`, top: `${m.y}%` }}>
                    <HotspotMarker bg="bg-[var(--accent)]/75" icon={actionIcon(h.edit, "h-3.5 w-3.5 text-white")} />
                    <HotspotLabel text={h.label} side={m.x > 55 ? "left" : "right"} />
                  </span>
                );
              })}
            </div>
            <div className="p-4">
              <p className="text-base font-bold tracking-tight">Reimagined</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                {changes.length} change{changes.length === 1 ? "" : "s"}
                {priced > 0 && <> · {priced} shoppable</>}
              </p>
            </div>
          </WalkCard>
        )}

        {/* ONE CARD PER CHANGE */}
        {changes.map((e) => {
          const tone = TONE[toneOf(e)];
          const name = e.product_title ?? e.target_label ?? "Item";
          return (
            <WalkCard key={e.id}>
              {e.reference_url ? (
                <CardImage src={e.reference_url} contain />
              ) : (
                <div className="h-[150px] bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)]">
                  <ChangeIcon e={e} className="h-8 w-8" />
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col">
                <span className={`inline-flex items-center gap-1 self-start rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone.cls}`}>
                  <ChangeIcon e={e} className="h-3 w-3" /> {tone.verb}
                </span>
                <p className="text-base font-bold tracking-tight capitalize mt-2 leading-snug">{name}</p>
                {e.buy_url ? (
                  <>
                    <p className="text-sm mt-1">
                      {e.product_price && <span className="font-bold">{e.product_price}</span>}
                      {e.product_price && <span className="text-[var(--muted-foreground)]"> · </span>}
                      <span className="text-[var(--muted-foreground)]">{storeName(e.buy_url)}</span>
                    </p>
                    <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
                      className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] text-sm font-semibold px-4 py-2.5">
                      Buy <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </>
                ) : (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    {e.kind === "add" ? "Added to this room" : e.kind === "remove" ? "Removed from this room" : "Swapped into this room"}
                  </p>
                )}
              </div>
            </WalkCard>
          );
        })}

        {/* SHOP ALL / CTA */}
        <WalkCard>
          {products.length > 0 ? (
            <div className="p-4 flex-1 flex flex-col overflow-y-auto">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                <p className="text-base font-bold tracking-tight">Shop this look</p>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] mt-1 mb-3">
                {products.length} item{products.length === 1 ? "" : "s"}
                {priced > 0 && <> · from <span className="font-semibold text-[var(--foreground)]">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}
              </p>
              <div className="space-y-2">
                {products.map((e) => (
                  <a key={e.id} href={e.buy_url ?? undefined} target="_blank" rel="noopener noreferrer"
                    className="flex gap-2.5 items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-[var(--shadow-soft)]">
                    {e.reference_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={e.reference_url} alt="" className="h-11 w-11 rounded-lg object-cover border border-[var(--border)] shrink-0" />
                    ) : (
                      <span className="h-11 w-11 rounded-lg bg-[var(--muted)] shrink-0" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold truncate capitalize">{e.product_title ?? e.target_label}</span>
                      <span className="block text-[11px] text-[var(--muted-foreground)]">
                        {e.product_price && <span className="font-semibold text-[var(--foreground)]">{e.product_price}</span>} · {storeName(e.buy_url)}
                      </span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
                  </a>
                ))}
              </div>
              <Link href="/restyle/new" className="mt-4">
                <Button variant="primary" className="w-full">Try this on your room →</Button>
              </Link>
            </div>
          ) : (
            <div className="p-6 flex-1 flex flex-col items-center justify-center text-center space-y-3">
              <span className="h-12 w-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-[var(--accent-soft-foreground)]" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Like what you see?</p>
                <p className="text-xs text-[var(--muted-foreground)]">Reimagine your own room in minutes — completely from scratch.</p>
              </div>
              <Link href="/restyle/new" className="w-full">
                <Button variant="primary" className="w-full">Try this design →</Button>
              </Link>
            </div>
          )}
        </WalkCard>
      </div>

      {/* dots */}
      <div className="shrink-0 flex justify-center gap-1.5 py-3">
        {Array.from({ length: stepCount }).map((_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-[var(--border)]"}`} />
        ))}
      </div>
    </div>
  );
}

// One walkthrough card — fixed width, scroll-snap centered, tall enough to fill the strip.
function WalkCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="snap-center shrink-0 w-[86%] max-w-[360px] h-full flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)] overflow-hidden">
      {children}
    </div>
  );
}

// Card hero image with an optional corner badge.
function CardImage({ src, label, labelCls, contain }: { src: string; label?: string; labelCls?: string; contain?: boolean }) {
  return (
    <div className="relative bg-[var(--muted)] shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={contain ? "block w-full h-[180px] object-contain" : "block w-full h-[240px] object-cover"} />
      {label && (
        <span className={`absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full text-white ${labelCls ?? "bg-black/55"}`}>
          {label}
        </span>
      )}
    </div>
  );
}
