"use client";

import { useEffect, useRef, useState } from "react";
import { Columns2, Download, Plus, Share2, Check, ArrowLeftRight } from "lucide-react";
import type { CanvasHotspot, RestyleWorkspace } from "./useRestyleWorkspace";
import { Button, IconButton, ProgressOverlay, ShopSummaryPill } from "./ui";
import ObjectHotspots from "./ObjectHotspots";
import HotspotPopover from "./HotspotPopover";
import QueuedHotspotPopover from "./QueuedHotspotPopover";
import PinPlacementLayer from "./PinPlacementLayer";

/**
 * The room photo — centerpiece of the editor. Whichever image is on screen (original or a
 * render) is a live canvas: every detected item stays tappable via `ws.canvasHotspots`, so
 * the user can keep swapping/adding/removing and regenerating from a render, not just the
 * original. A hotspot's state (idle/queued/placed) decides what tapping it does:
 *   idle    → open sourcing (nothing staged for it)
 *   queued  → a light "here's what's queued" teaser (Change/Remove) — NOT the placed/priced
 *             popover, since this change isn't actually in the pictured image yet
 *   placed  → the placed/priced popover (thumbnail, price, Show similar / Buy) — this can
 *             only occur on a render (see canvasHotspots — "placed" is derived from what's
 *             actually in the displayed image's signature, which is empty on the original)
 * Generate progress overlays right here instead of a separate result screen. `ws.pinRequest`
 * overlays a tap-to-place layer on the original photo right after a new "add" item stages,
 * ahead of everything else.
 */
export default function RestyleCanvas({ ws }: { ws: RestyleWorkspace }) {
  const { restyle, generating, displayUrl, previewUrl } = ws;
  const [showCompare, setShowCompare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openHotspot, setOpenHotspot] = useState<{ label: string; cx: number; cy: number; edit: NonNullable<CanvasHotspot["edit"]> } | null>(null);
  const [queuedPreview, setQueuedPreview] = useState<{ label: string; cx: number; cy: number; edit: NonNullable<CanvasHotspot["edit"]> } | null>(null);

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

  const handleTap = (h: CanvasHotspot, cx: number, cy: number) => {
    if (h.state === "idle") { ws.openSourcing(h.label, "swap"); return; }
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

  return (
    <div className="space-y-2">
      <div className="relative bg-[var(--muted)] border border-[var(--border)] rounded-3xl overflow-hidden flex items-center justify-center p-2 min-h-[40vh]">
        {viewingOriginal ? (
          <div className="relative inline-block max-h-[65dvh] md:max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restyle.original_url} alt="Your room" className="block max-w-full max-h-[65dvh] md:max-h-[70vh] object-contain" />
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
                onPlace={(x, y, note) => ws.setPlacement(ws.pinRequest!.editId, { x, y, note })}
                onCancel={ws.cancelPin} />
            )}
          </div>
        ) : !showCompare ? (
          <div className="relative inline-block max-h-[65dvh] md:max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="Restyled room" className="block max-w-full max-h-[65dvh] md:max-h-[70vh] object-contain" />
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
          <div ref={imgWrapRef} className="relative select-none max-h-[65dvh] md:max-h-[70vh] inline-block touch-none" {...sliderHandlers}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="After" className="block max-h-[65dvh] md:max-h-[70vh] w-auto max-w-full object-contain" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restyle.original_url} alt="Before" draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
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

        {generating && <ProgressOverlay status="Generating your room…" subtext="Usually 20–60 seconds" />}

        {!viewingOriginal && !generating && !showCompare && ws.productEdits.length > 0 && (
          <div className="absolute bottom-3 left-3 hidden md:block">
            <ShopSummaryPill edits={ws.productEdits} />
          </div>
        )}

        {!generating && !showCompare && !ws.pinRequest && (
          <div className="absolute bottom-3 right-3">
            <Button variant="primary" size="sm" className="shadow-[var(--shadow-pop)]"
              onClick={() => ws.openSourcing("", "add")}>
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
      <p className="text-[11px] text-[var(--muted-foreground)] text-center">
        {ws.pinRequest ? "Tap the photo to choose where it goes"
          : viewingOriginal ? "Tap an item to swap it, or add something new"
          : previewUrl ? "Viewing an earlier version — tap an item to keep editing"
          : "Tap an item to swap it, shop it, or add something new"}
      </p>
    </div>
  );
}
