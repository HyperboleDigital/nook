"use client";

import { useEffect, useState } from "react";
import { Columns2, Download, Share2, Check, ArrowLeftRight } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { RestyleEdit } from "@/types";
import { IconButton, ProgressOverlay } from "./ui";
import ObjectHotspots from "./ObjectHotspots";
import HotspotPopover from "./HotspotPopover";

/**
 * The room photo — centerpiece of the editor. Shows hotspots over the original photo (real
 * detected positions), or over a render (approximated from each swapped item's original
 * position — "added" items have no known position and rely on the shop list below instead).
 * Tapping a hotspot for something already staged shows a quick product popover first; tapping
 * an empty slot opens the sourcing panel directly. Generate progress overlays right here
 * instead of a separate result screen.
 */
export default function RestyleCanvas({ ws }: { ws: RestyleWorkspace }) {
  const { restyle, generating, compare, imgWrapRef, sliderHandlers, displayUrl, previewUrl } = ws;
  const [showCompare, setShowCompare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openHotspot, setOpenHotspot] = useState<{ label: string; cx: number; cy: number; edit: RestyleEdit } | null>(null);

  // The popover's coordinates are meaningless once the displayed image changes (switching
  // between original/render/an earlier version) — close it rather than leave it floating
  // over the wrong photo.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) setOpenHotspot(null); });
    return () => { active = false; };
  }, [displayUrl]);

  if (!restyle) return null;
  const viewingOriginal = displayUrl === restyle.original_url;
  const stagedLabels = new Set(ws.stagedItems.map((e) => e.target_label?.toLowerCase()).filter(Boolean) as string[]);

  const findStagedEdit = (label: string) =>
    ws.stagedItems.find((e) => e.target_label?.toLowerCase() === label.toLowerCase()) ?? null;

  // A hotspot for something already staged shows the quick popover; an empty slot on the
  // original photo goes straight to sourcing since there's nothing yet to preview.
  const handleHotspotTap = (label: string, cx: number, cy: number) => {
    const edit = findStagedEdit(label);
    if (edit) setOpenHotspot({ label, cx, cy, edit });
    else ws.openSourcing(label, "swap");
  };
  const showSimilarFromPopover = () => {
    if (!openHotspot) return;
    ws.openSimilar(openHotspot.label, "swap", openHotspot.edit.id);
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
      <div className="relative bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center p-2 min-h-[40vh]">
        {viewingOriginal ? (
          <div className="relative inline-block max-h-[65dvh] md:max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={restyle.original_url} alt="Your room" className="block max-w-full max-h-[65dvh] md:max-h-[70vh] object-contain" />
            {ws.objects.length > 0 && (
              <ObjectHotspots objects={ws.objects} activeLabel={ws.sourcing?.label} stagedLabels={stagedLabels}
                onSelect={handleHotspotTap} />
            )}
            {openHotspot && (
              <HotspotPopover edit={openHotspot.edit} label={openHotspot.label} cx={openHotspot.cx} cy={openHotspot.cy}
                onShowSimilar={showSimilarFromPopover} onClose={() => setOpenHotspot(null)} />
            )}
          </div>
        ) : !showCompare ? (
          <div className="relative inline-block max-h-[65dvh] md:max-h-[70vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={displayUrl} alt="Restyled room" className="block max-w-full max-h-[65dvh] md:max-h-[70vh] object-contain" />
            {ws.renderHotspots.length > 0 && (
              <ObjectHotspots
                objects={ws.renderHotspots.map((h) => ({ label: h.label, box_2d: h.box_2d }))}
                activeLabel={ws.sourcing?.label} stagedLabels={stagedLabels}
                onSelect={handleHotspotTap} />
            )}
            {openHotspot && (
              <HotspotPopover edit={openHotspot.edit} label={openHotspot.label} cx={openHotspot.cx} cy={openHotspot.cy}
                onShowSimilar={showSimilarFromPopover} onClose={() => setOpenHotspot(null)} />
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
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 bg-white border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </div>
            </div>
            <span className="absolute bottom-3 left-3 text-[10px] px-2 py-1 bg-black/60 text-white">Before</span>
            <span className="absolute bottom-3 right-3 text-[10px] px-2 py-1 bg-black/60 text-white">After</span>
          </div>
        )}

        {generating && <ProgressOverlay status="Generating your room…" subtext="Usually 20–60 seconds" />}

        <div className="absolute top-3 right-3 flex items-center gap-2">
          {copied && <span className="text-[11px] px-2 py-1 bg-[var(--foreground)] text-[var(--background)]">Link copied</span>}
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
        {viewingOriginal ? "Tap an item to swap it, or add something new" : previewUrl ? "Viewing an earlier version" : "Your restyled room"}
      </p>
    </div>
  );
}
