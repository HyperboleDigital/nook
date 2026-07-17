"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, Download, Plus, Share2, ArrowLeftRight, GalleryVerticalEnd } from "lucide-react";
import type { CSSProperties } from "react";
import type { CanvasHotspot, RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, IconButton, ProgressOverlay, Sheet, ShopSummaryPill, Spinner } from "./ui";
import ObjectHotspots from "./ObjectHotspots";
import PinPlacementLayer from "./PinPlacementLayer";
import ShareMenu, { ShareOptions } from "./ShareMenu";
import ShopCart from "./ShopCart";
import VersionsGallery from "./VersionsGallery";

// Fallback for the brief window before the frame/image have been measured (or if width/height
// are ever unknown): natural aspect, full width, height follows. Rounded + shadowed like the
// measured box below, so the photo reads as a floating card over the blurred backdrop either way.
const FALLBACK_WRAP = "relative block w-full rounded-3xl overflow-hidden shadow-[var(--shadow-pop)]";
const FALLBACK_IMG = "block w-full h-auto max-h-[85dvh] object-contain";

/**
 * The room photo — the ONE image the user is editing. There is no version navigation and no
 * "viewing the original": `ws.displayUrl` is always the current generation. The original photo
 * and past renders exist only as backend machinery (recompose composites from the original;
 * `restyle_renders` caches per active-edit signature so toggling a change back is instant). So
 * this is a live canvas: every detected item stays tappable via `ws.canvasHotspots`, and tapping
 * ANY of them — changed or not — opens the same "Edit item" menu in the rail/sheet (see
 * `handleTap` → `ws.openSourcing`; there are no on-canvas popovers anymore, everything routes to
 * the one consistent menu). "+ Add" drops a pin over THIS image (the current render, not the
 * bare original) via `ws.pinRequest`. Download/share always reflect the current generation.
 *
 * The stage has a FIXED height on every breakpoint (a viewport-relative height on mobile since
 * the page scrolls, `flex-1` filling the immersive column on desktop), so a portrait photo
 * can't fill both axes the way a simple `w-full h-auto` box could. CSS percentage-height
 * shrink-wrapping is genuinely ambiguous per spec when the wrapper's own height comes from its
 * content — so instead this measures the stage (ResizeObserver) + the rendered image's natural
 * size and pins the wrapper to the exact contained pixel box, so object-cover fills it perfectly
 * and every %-positioned hotspot/pin lands correctly (the wrapper IS the image's true rendered
 * box, in pixels). A blurred, darkened copy of the same image fills the stage edge-to-edge behind
 * it (just backdrop) while the sharp photo floats on top as a rounded, shadowed card.
 */
// `fluid` (mobile): the image is shown FULL-WIDTH at its natural aspect ratio — no fixed-height
// stage, no blurred letterbox backdrop, no floating rounded card — so the changes panel below can
// sit flush against the image's true bottom edge whether the photo is portrait or landscape. The
// image element IS the hotspot-positioning box, so the %-coords land directly (no measured pixel
// box needed). Desktop stays on the measured-box + blurred-backdrop stage (it fills a fixed column
// beside the rail — see the doc comment above).
export default function RestyleCanvas({ ws, fluid = false }: { ws: RestyleWorkspace; fluid?: boolean }) {
  const { restyle, generating, displayUrl } = ws;
  const [showCompare, setShowCompare] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  // Desktop image-box measurement (see doc comment above). `naturalSize` is measured directly
  // off the actual rendered <img> (onLoad) rather than trusted solely from `restyle.width`/
  // `height` — that DB column is normally correct, but hotspot placement is precise enough that
  // any drift between it and the real bytes on screen would visibly misalign every pin. The DB
  // value is still used as an instant first-paint fallback before the image has finished loading.
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  // The last displayUrl whose <img> actually finished loading — used below to keep the
  // ProgressOverlay up until the NEW image has visibly painted, instead of it vanishing the
  // instant `generating` flips false and leaving a stale frame of the old room on screen for a
  // beat while the new one decodes.
  const [settledUrl, setSettledUrl] = useState<string | null>(null);
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const t = e.currentTarget;
    if (t.naturalWidth && t.naturalHeight) setNaturalSize({ w: t.naturalWidth, h: t.naturalHeight });
    setSettledUrl(t.src);
  };
  // Safety valve: if the new image never fires onLoad (broken URL, aggressive cache, etc.) don't
  // strand the overlay forever — release it a few seconds after generating finishes regardless.
  const [wasGenerating, setWasGenerating] = useState(false);
  useEffect(() => {
    let active = true;
    if (generating) {
      Promise.resolve().then(() => { if (active) setWasGenerating(true); });
      return () => { active = false; };
    }
    if (!wasGenerating) return () => { active = false; };
    const t = setTimeout(() => { if (active) setWasGenerating(false); }, 5000);
    return () => { active = false; clearTimeout(t); };
  }, [generating, wasGenerating]);
  const holdingOverlay = wasGenerating && !generating && displayUrl !== settledUrl;
  // `ws.generatingStartedAt` gets nulled the moment generating flips false — the same instant
  // we want the overlay to keep showing (holdingOverlay) — so remember the last real value to
  // keep feeding ProgressOverlay a valid startedAt through the hold period.
  const [lastStartedAt, setLastStartedAt] = useState<number | null>(null);
  useEffect(() => {
    if (ws.generatingStartedAt == null) return;
    let active = true;
    Promise.resolve().then(() => { if (active) setLastStartedAt(ws.generatingStartedAt); });
    return () => { active = false; };
  }, [ws.generatingStartedAt]);
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

  if (!restyle) return null;
  const { viewingOriginal } = ws;

  const natW = naturalSize?.w || restyle.width || 0;
  const natH = naturalSize?.h || restyle.height || 0;
  let imgBoxStyle: CSSProperties | undefined;
  if (natW && natH && frameSize.w && frameSize.h) {
    const scale = Math.min(frameSize.w / natW, frameSize.h / natH);
    const w = natW * scale, h = natH * scale;
    imgBoxStyle = { position: "absolute", left: (frameSize.w - w) / 2, top: (frameSize.h - h) / 2, width: w, height: h };
  }
  // Fluid (mobile) shows the image full-width at natural aspect (the <img> is the box); the
  // measured/fallback treatment is desktop-only.
  const imgWrapClass = fluid ? "relative block w-full" : imgBoxStyle ? "relative rounded-3xl overflow-hidden shadow-[var(--shadow-pop)]" : FALLBACK_WRAP;
  const imgClass = fluid ? "block w-full h-auto" : imgBoxStyle ? "block w-full h-full object-cover" : FALLBACK_IMG;
  const wrapStyle = fluid ? undefined : imgBoxStyle;
  const frameClass = fluid
    ? "relative w-full bg-[var(--muted)] overflow-hidden"
    : "relative bg-[var(--muted)] overflow-hidden flex items-center justify-center h-[65dvh] md:h-auto md:flex-1";

  // Tapping any actionable item opens the unified edit menu (rail on desktop, sheet on mobile),
  // passing the item's current staged edit id so Swap/Similar/Adjust supersede it. A detected
  // item is mode "swap"; a placed "add" (no detected match) is mode "add" so the menu/back logic
  // treats it correctly.
  const handleTap = (h: CanvasHotspot) => {
    if (h.state === "confirming") return; // still round-tripping to the server — nothing to act on yet
    const isDetected = ws.objects.some((o) => o.label.toLowerCase() === h.label.toLowerCase());
    ws.openSourcing(h.label, isDetected ? "swap" : "add", h.edit?.id ?? null);
  };

  const shareUrl = `${window.location.origin}/r/${ws.id}`;
  const shareTitle = restyle.title ?? "Room design";

  // Skip the pin step: for the upfront add flow (no edit yet) proceed to sourcing without a
  // location; for the post-hoc offer (edit exists) just close the pin layer.
  const skipPin = () => (ws.pinRequest?.editId ? ws.cancelPin() : ws.skipAddLocation());
  const pinLabel = ws.pinRequest?.label?.trim() ? `your ${ws.pinRequest.label.trim()}` : "your new item";

  return (
    <div className={fluid ? "w-full" : "h-full w-full md:flex md:flex-col"}>
      {/* Pin-placement instruction lives HERE, above the photo — never over it — so it can't
          cover the very spot the user wants to tap. The layer itself (PinPlacementLayer) is now
          just the invisible tap-catcher + the confirm popover at the chosen point. */}
      {ws.pinRequest && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[var(--foreground)] text-[var(--background)] text-xs">
          <span className="font-medium">Tap the photo to place {pinLabel}</span>
          <button type="button" onClick={skipPin}
            className="rounded-full px-3 py-1 bg-white/15 hover:bg-white/25 transition-colors shrink-0">
            Cancel
          </button>
        </div>
      )}
      <div ref={frameRef} className={frameClass}>
        {/* A blurred, darkened cover fill behind a portrait (or otherwise mismatched-aspect)
            photo so the gutters beside the shrink-wrapped sharp image read as an intentional
            frame, not a broken letterbox. Not needed in fluid mode (no gutters — the image is
            full-width at its own aspect). */}
        {!fluid && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={displayUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover blur-2xl brightness-50 scale-110" />
        )}

        {!showCompare ? (
          <div className={imgWrapClass} style={wrapStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt={restyle.title ?? "Your room"} className={imgClass} onLoad={onImgLoad} />
            {ws.canvasHotspots.length > 0 && !ws.pinRequest && (
              <ObjectHotspots hotspots={ws.canvasHotspots} activeLabel={ws.sourcing?.label} onSelect={handleTap} />
            )}
            {ws.pinRequest && (
              <PinPlacementLayer label={ws.pinRequest.label}
                onPlace={(x, y, note) => ws.pinRequest!.editId
                  ? ws.setPlacement(ws.pinRequest!.editId, { x, y, note })
                  : ws.placeAddLocation(x, y, note)}
                onCancel={skipPin} />
            )}
          </div>
        ) : (
          <div ref={imgWrapRef} className={`${imgWrapClass} select-none touch-none`} style={wrapStyle} {...sliderHandlers}>
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

        {ws.detecting && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white/95 border border-[var(--border)] text-[var(--muted-foreground)] text-xs px-3 py-1.5 shadow-[var(--shadow-pop)]">
            <Spinner size="xs" /> Finding your furniture…
          </div>
        )}

        {(generating || holdingOverlay) && lastStartedAt != null && (
          <ProgressOverlay startedAt={lastStartedAt} expectedSeconds={ws.expectedSeconds} />
        )}

        {/* Was desktop-only ("hidden md:block") — mobile lost the at-a-glance total entirely,
            even though it fits fine (+Add sits bottom-right, no collision). */}
        {!viewingOriginal && !generating && !holdingOverlay && !showCompare && ws.productEdits.length > 0 && (
          <div className="absolute left-3 bottom-3">
            <ShopSummaryPill edits={ws.productEdits} onClick={() => setCartOpen(true)} />
          </div>
        )}
        <ShopCart ws={ws} open={cartOpen} onClose={() => setCartOpen(false)} />
        <VersionsGallery ws={ws} open={versionsOpen} onClose={() => setVersionsOpen(false)} />

        {/* Clean, Gemini-style save toast — appears while the full-size image is being fetched /
            handed to the OS save sheet, then clears itself. */}
        {ws.downloadToast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 animate-[fade-in_0.2s_ease-out]">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--foreground)] text-white px-4 py-2 text-xs shadow-[var(--shadow-pop)]">
              <Spinner size="xs" className="text-white" />
              {ws.downloadToast}
            </div>
          </div>
        )}

        {!generating && !holdingOverlay && !showCompare && !ws.pinRequest && (
          <div className="absolute right-3 bottom-3">
            <Button variant="primary" size="sm"
              className="relative shadow-[var(--shadow-pop)] before:absolute before:-inset-2 before:rounded-full before:content-['']"
              onClick={() => ws.startAddFlow()}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}

        <div className="absolute top-3 right-3 flex items-center gap-3">
          {/* Versions history — every generated combination, browsable. Only worth showing once
              there's more than one render to move between. */}
          {ws.renders.length > 1 && (
            <IconButton onClick={() => setVersionsOpen(true)} aria-label="Versions history">
              <GalleryVerticalEnd className="h-4 w-4" />
            </IconButton>
          )}
          {!viewingOriginal && (
            <IconButton onClick={() => setShowCompare((v) => !v)} aria-label="Compare before / after"
              className={showCompare ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)] hover:text-[var(--background)]" : ""}>
              <Columns2 className="h-4 w-4" />
            </IconButton>
          )}
          <div className="relative">
            <IconButton onClick={() => setShareOpen((v) => !v)} aria-label="Share link">
              <Share2 className="h-4 w-4" />
            </IconButton>
            {shareOpen && <ShareMenu url={shareUrl} title={shareTitle} onClose={() => setShareOpen(false)} />}
          </div>
          <IconButton onClick={ws.downloadImage} aria-label="Download image">
            <Download className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Mobile share is a bottom sheet, not the edge-anchored popover — consistent with every
          other mobile surface in the editor. */}
      <div className="md:hidden">
        <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share this room">
          <ShareOptions url={shareUrl} title={shareTitle} onDone={() => setShareOpen(false)} />
        </Sheet>
      </div>
      {/* Mobile "tap an item" hint — omitted in fluid mode (it would sit between the image and the
          flush changes sheet and get clipped by the sheet's overlap); the ChangesPanel's own empty
          state ("Nothing queued yet — tap an item…") already carries the same guidance there.
          pinRequest is handled by the instruction bar above the photo, so it's omitted then too. */}
      {!ws.pinRequest && !fluid && (
        <p className="md:hidden text-[11px] text-[var(--muted-foreground)] text-center py-2 px-3">
          {viewingOriginal ? "Tap an item to edit it, or add something new"
            : "Tap an item to edit it, shop it, or add something new"}
        </p>
      )}
    </div>
  );
}
