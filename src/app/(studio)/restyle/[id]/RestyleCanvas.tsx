"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, Download, Plus, Share2, Check, ArrowLeftRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { CanvasHotspot, RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, IconButton, ProgressOverlay, ShopSummaryPill } from "./ui";
import ObjectHotspots from "./ObjectHotspots";
import HotspotPopover from "./HotspotPopover";
import QueuedHotspotPopover from "./QueuedHotspotPopover";
import PinPlacementLayer from "./PinPlacementLayer";

// Fallback for the brief window before the frame/image have been measured (or if width/height
// are ever unknown): natural aspect, full width, height follows. Rounded + shadowed like the
// measured box below, so the photo reads as a floating card over the blurred backdrop either way.
const FALLBACK_WRAP = "relative block w-full rounded-3xl overflow-hidden shadow-[var(--shadow-pop)]";
const FALLBACK_IMG = "block w-full h-auto max-h-[85dvh] object-contain";

/**
 * The room photo — centerpiece of the editor. Whichever image is on screen (original or a
 * render) is a live canvas: every detected item stays tappable via `ws.canvasHotspots`, so the
 * user can keep swapping/adding/removing and regenerating from a render, not just the original.
 * A hotspot's state (idle/queued/placed) decides what tapping it does:
 *   idle    → open sourcing (nothing staged for it)
 *   queued  → a light "here's what's queued" teaser (Change/Remove) — NOT the placed/priced
 *             popover, since this change isn't actually in the pictured image yet
 *   placed  → the placed/priced popover (thumbnail, price, Show similar / Buy) — this can
 *             only occur on a render (see canvasHotspots — "placed" is derived from what's
 *             actually in the displayed image's signature, which is empty on the original)
 * Generate progress overlays right here instead of a separate result screen. `ws.pinRequest`
 * overlays a tap-to-place layer on the original photo right after a new "add" item stages,
 * ahead of everything else. The raw original photo is intentionally NOT offered as a
 * navigable "version" (see VersionsStrip) — it's a silent backend reference recompose always
 * composites from, not a state a user picks; download/share always reflect whatever's
 * currently displayed (the live render with its current on/off toggle state).
 *
 * The stage has a FIXED height on every breakpoint (a viewport-relative height on mobile since
 * the page scrolls, `flex-1` filling the immersive column on desktop), so a portrait photo
 * can't fill both axes the way a simple `w-full h-auto` box could. CSS percentage-height
 * shrink-wrapping (`max-h-full` on an auto-sized wrapper) is genuinely ambiguous per spec when
 * the wrapper's own height comes from its content — so instead this measures the stage
 * (ResizeObserver) and computes the contained image's exact pixel box from `restyle.width`/
 * `height` (the canonical dimensions every displayed image already shares, guaranteed by
 * upload-time canonicalization + recompose's fixed-size output). The wrapper is then pinned to
 * that exact pixel box, so object-cover fills it perfectly with no letterboxing math needed, and
 * every %-positioned hotspot/popover still lands correctly since the wrapper IS the image's true
 * rendered box, in pixels, not a CSS approximation. A blurred, darkened copy of the same image
 * fills the stage edge-to-edge behind it (no rounding, no shadow — it's just backdrop) while the
 * sharp photo floats on top as a rounded, shadowed card (`imgWrapClass`) — the stage itself has
 * no rounding/border, only the photo does.
 */
export default function RestyleCanvas({ ws }: { ws: RestyleWorkspace }) {
  const { restyle, generating, displayUrl, previewUrl } = ws;
  const [showCompare, setShowCompare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openHotspot, setOpenHotspot] = useState<{ label: string; cx: number; cy: number; edit: NonNullable<CanvasHotspot["edit"]> } | null>(null);
  const [queuedPreview, setQueuedPreview] = useState<{ label: string; cx: number; cy: number; edit: NonNullable<CanvasHotspot["edit"]> } | null>(null);

  // Desktop image-box measurement (see doc comment above). `naturalSize` is measured directly
  // off the actual rendered <img> (onLoad) rather than trusted solely from `restyle.width`/
  // `height` — that DB column is normally correct, but hotspot placement is precise enough that
  // any drift between it and the real bytes on screen (a stale value, a legacy row from before
  // the column existed) would visibly misalign every pin. The DB value is still used as an
  // instant first-paint fallback before the image has finished loading.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (t.naturalWidth && t.naturalHeight) setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
  };
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setFrameSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Before/after slider. Local to this component (nothing else reads it) and throttled to at
  // most one state update per animation frame — calling setCompare on every raw pointermove
  // re-renders on every pixel of movement, which is what made dragging feel laggy.
  const [compare, setCompare] = useState(50);
  const dragging = useRef(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);
  const pendingClientX = useRef<number | null>(null);
  const moveCompare = (clientX: number) => {
    pendingClientX.current = clientX;
    if (rafId.current != null) return; // a frame is already scheduled — coalesce
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = imgWrapRef.current;
      const cx = pendingClientX.current;
      if (!el || cx == null) return;
      const rect = el.getBoundingClientRect();
      setCompare(Math.max(0, Math.min(100, ((cx - rect.left) / rect.width) * 100)));
    });
  };
  const sliderHandlers = {
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; moveCompare(e.clientX); },
    onPointerMove: (e: React.PointerEvent) => { if (dragging.current) moveCompare(e.clientX); },
    onPointerUp: (e: React.PointerEvent) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); },
    onPointerCancel: () => { dragging.current = false; },
  };
  useEffect(() => () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); }, []);

  // A popover's coordinates are meaningless once the displayed image changes (switching
  // between original/render/an earlier version) — close them rather than leave one floating
  // over the wrong photo.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) { setOpenHotspot(null); setQueuedPreview(null); } });
    return () => { active = false; };
  }, [displayUrl]);

  if (!restyle) return null;
  const { viewingOriginal } = ws;
  const backdropSrc = viewingOriginal ? restyle.original_url : displayUrl;

  const natW = naturalSize?.w || restyle.width || 0;
  const natH = naturalSize?.h || restyle.height || 0;
  let imgBoxStyle: CSSProperties | undefined;
  if (natW && natH && frameSize.w && frameSize.h) {
    const scale = Math.min(frameSize.w / natW, frameSize.h / natH);
    const w = natW * scale, h = natH * scale;
    imgBoxStyle = { position: "absolute", left: (frameSize.w - w) / 2, top: (frameSize.h - h) / 2, width: w, height: h };
  }
  const imgWrapClass = imgBoxStyle ? "relative rounded-3xl overflow-hidden shadow-[var(--shadow-pop)]" : FALLBACK_WRAP;
  const imgClass = imgBoxStyle ? "block w-full h-full object-cover" : FALLBACK_IMG;

  const handleTap = (h: CanvasHotspot, cx: number, cy: number) => {
    if (h.state === "idle") { ws.openSourcing(h.label, "swap"); return; }
    if (h.state === "confirming") return; // still round-tripping to the server — nothing to act on yet
    if (h.state === "queued") { setQueuedPreview({ label: h.label, cx, cy, edit: h.edit! }); setOpenHotspot(null); return; }
    setOpenHotspot({ label: h.label, cx, cy, edit: h.edit! }); setQueuedPreview(null);
  };
  const changeFromQueued = () => {
    if (!queuedPreview) return;
    const { label, edit } = queuedPreview;
    ws.openSimilar(label, edit.kind === "add" ? "add" : "swap", edit.id);
    setQueuedPreview(null);
  };
  const removeFromQueued = () => {
    if (!queuedPreview) return;
    ws.remove(queuedPreview.edit.id);
    setQueuedPreview(null);
  };
  const showSimilarFromPopover = () => {
    if (!openHotspot) return;
    ws.openSimilar(openHotspot.label, "swap", openHotspot.edit.id);
    setOpenHotspot(null);
  };
  const toggleOffFromPopover = () => {
    if (!openHotspot) return;
    ws.toggleAndRegenerate(openHotspot.edit.id, false);
    setOpenHotspot(null);
  };

  const share = async () => {
    const url = `${window.location.origin}/r/${ws.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: restyle.title ?? "Room design", url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* user cancelled share sheet */ }
  };

  // Skip the pin step: for the upfront add flow (no edit yet) proceed to sourcing without a
  // location; for the post-hoc offer (edit exists) just close the pin layer.
  const skipPin = () => (ws.pinRequest?.editId ? ws.cancelPin() : ws.skipAddLocation());
  const pinLabel = ws.pinRequest?.label?.trim() ? `your ${ws.pinRequest.label.trim()}` : "your new item";

  return (
    <div className="h-full w-full md:flex md:flex-col">
      {/* Pin-placement instruction lives HERE, above the photo — never over it — so it can't
          cover the very spot the user wants to tap. The layer itself (PinPlacementLayer) is now
          just the invisible tap-catcher + the confirm popover at the chosen point. */}
      {ws.pinRequest && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[var(--foreground)] text-[var(--background)] text-xs">
          <span className="font-medium">Tap the photo to place {pinLabel}</span>
          <button type="button" onClick={skipPin}
            className="rounded-full px-3 py-1 bg-white/15 hover:bg-white/25 transition-colors shrink-0">
            Skip
          </button>
        </div>
      )}
      <div ref={frameRef} className="relative bg-[var(--muted)] overflow-hidden flex items-center justify-center h-[65dvh] md:h-auto md:flex-1">
        {/* A blurred, darkened cover fill behind a portrait (or otherwise mismatched-aspect)
            photo so the gutters beside the shrink-wrapped sharp image read as an intentional
            frame, not a broken letterbox. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backdropSrc} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover blur-2xl brightness-50 scale-110" />

        {viewingOriginal ? (
          <div className={imgWrapClass} style={imgBoxStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restyle.original_url} alt="Your room" className={imgClass} onLoad={onImgLoad} />
            {ws.canvasHotspots.length > 0 && (
              <ObjectHotspots hotspots={ws.canvasHotspots} activeLabel={ws.sourcing?.label} onSelect={handleTap} />
            )}
            {queuedPreview && !ws.pinRequest && (
              <QueuedHotspotPopover
                edit={queuedPreview.edit} label={queuedPreview.label}
                cx={queuedPreview.cx} cy={queuedPreview.cy}
                onChange={changeFromQueued}
                onRemove={queuedPreview.edit.id.startsWith("optimistic-") ? undefined : removeFromQueued}
                onClose={() => setQueuedPreview(null)} />
            )}
            {ws.pinRequest && (
              <PinPlacementLayer label={ws.pinRequest.label}
                onPlace={(x, y, note) => ws.pinRequest!.editId
                  ? ws.setPlacement(ws.pinRequest!.editId, { x, y, note })
                  : ws.placeAddLocation(x, y, note)}
                onCancel={skipPin} />
            )}
          </div>
        ) : !showCompare ? (
          <div className={imgWrapClass} style={imgBoxStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="Restyled room" className={imgClass} onLoad={onImgLoad} />
            {ws.canvasHotspots.length > 0 && (
              <ObjectHotspots hotspots={ws.canvasHotspots} activeLabel={ws.sourcing?.label} onSelect={handleTap} />
            )}
            {queuedPreview && (
              <QueuedHotspotPopover
                edit={queuedPreview.edit} label={queuedPreview.label}
                cx={queuedPreview.cx} cy={queuedPreview.cy}
                onChange={changeFromQueued}
                onRemove={queuedPreview.edit.id.startsWith("optimistic-") ? undefined : removeFromQueued}
                onClose={() => setQueuedPreview(null)} />
            )}
            {openHotspot && (
              <HotspotPopover edit={openHotspot.edit} label={openHotspot.label} cx={openHotspot.cx} cy={openHotspot.cy}
                canToggleOff={ws.productEdits.length + ws.inspoEdits.length > 1}
                onShowSimilar={showSimilarFromPopover} onToggleOff={toggleOffFromPopover} onClose={() => setOpenHotspot(null)} />
            )}
          </div>
        ) : (
          <div ref={imgWrapRef} className={`${imgWrapClass} select-none touch-none`} style={imgBoxStyle} {...sliderHandlers}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="After" className={imgClass} draggable={false} onLoad={onImgLoad} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restyle.original_url} alt="Before" draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
            <div className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none" style={{ left: `${compare}%` }}>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white border border-[var(--border)] shadow-[var(--shadow-soft)] flex items-center justify-center text-[var(--foreground)]">
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <span className="absolute bottom-3 left-3 text-[10px] px-2 py-1 rounded-full bg-black/60 text-white">Before</span>
            <span className="absolute bottom-3 right-3 text-[10px] px-2 py-1 rounded-full bg-black/60 text-white">After</span>
          </div>
        )}

        {generating && ws.generatingStartedAt != null && (
          <ProgressOverlay startedAt={ws.generatingStartedAt} expectedSeconds={ws.expectedSeconds} />
        )}

        {!viewingOriginal && !generating && !showCompare && ws.productEdits.length > 0 && (
          <div className="absolute bottom-3 left-3 hidden md:block">
            <ShopSummaryPill edits={ws.productEdits} />
          </div>
        )}

        {!generating && !showCompare && !ws.pinRequest && (
          <div className="absolute bottom-3 right-3">
            <Button variant="primary" size="sm" className="shadow-[var(--shadow-pop)]"
              onClick={() => ws.startAddFlow()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}

        <div className="absolute top-3 right-3 flex items-center gap-2">
          {copied && <span className="text-[11px] px-2 py-1 rounded-full bg-[var(--foreground)] text-[var(--background)]">Link copied</span>}
          {!viewingOriginal && (
            <IconButton onClick={() => setShowCompare((v) => !v)} aria-label="Compare before / after"
              className={showCompare ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)] hover:text-[var(--background)]" : ""}>
              <Columns2 className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton onClick={share} aria-label="Share link">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
          </IconButton>
          <IconButton onClick={ws.downloadImage} aria-label="Download image">
            <Download className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      {/* pinRequest is handled by the instruction bar above the photo, so it's omitted here. */}
      {!ws.pinRequest && (
        <p className="md:hidden text-[11px] text-[var(--muted-foreground)] text-center py-2 px-3">
          {viewingOriginal ? "Tap an item to swap it, or add something new"
            : previewUrl ? "Viewing an earlier version — tap an item to keep editing"
            : "Tap an item to swap it, shop it, or add something new"}
        </p>
      )}
    </div>
  );
}
