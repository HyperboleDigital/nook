"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface TourViewerProps {
  plyUrl: string;
}

export default function TourViewer({ plyUrl }: TourViewerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showHint, setShowHint] = useState(true);
  // Renderer is decided client-side after mount (navigator is SSR-undefined, and
  // gating the iframe on this avoids a hydration mismatch). WebGPU handles large
  // splats (1M+) that the WebGL path renders as a degenerate blob; we only fall
  // back to WebGL when the browser lacks WebGPU.
  const [renderer, setRenderer] = useState<"webgpu" | "webgl" | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Tracks how many zoom-in steps the user has taken from the starting position.
  // Zoom-out (scroll/button) is blocked when this is 0 — can't leave the room.
  const zoomStepsRef = useRef(0);

  useEffect(() => {
    setRenderer("gpu" in navigator ? "webgpu" : "webgl");
  }, []);

  // Self-hosted SuperSplat *viewer* (clean look-around), not the editor.
  // - content:  the PLY to load
  // - settings: a full v2 settings object. importSettings() accepts version:2 as-is;
  //             {} would run migrateV2, which reads v1.background.color and crashes.
  // - webgl:    only when WebGPU is unavailable (WebGPU required for 1M+ splats).
  // - noui:     hide editor chrome; we provide minimal controls.
  // cameras[0].initial: start inside the room at eye level. Auto-frame (cameras:[])
  //   parks the camera 16× too far out because floaters inflate the bbox pre-cull.
  const viewerSettings = {
    version: 2,
    tonemapping: "none",
    highPrecisionRendering: false,
    background: { color: [0, 0, 0] },
    postEffectSettings: {
      sharpness: { enabled: false, amount: 0 },
      bloom: { enabled: false, intensity: 1, blurLevel: 2 },
      grading: { enabled: false, brightness: 0, contrast: 1, saturation: 1, tint: [1, 1, 1] },
      vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
      fringing: { enabled: false, intensity: 0.5 },
    },
    animTracks: [],
    cameras: [{ initial: { position: [-0.64, 0.29, -0.08], target: [1.27, -0.01, 0.92], fov: 80 } }],
    annotations: [],
    startMode: "default",
  };
  const settings = `data:application/json,${encodeURIComponent(JSON.stringify(viewerSettings))}`;
  const src =
    `/viewer?content=${encodeURIComponent(plyUrl)}` +
    `&settings=${encodeURIComponent(settings)}` +
    `${renderer === "webgl" ? "&webgl" : ""}&noui&noanim`;

  // The viewer (same-origin) calls window.firstFrame() the moment the splat renders.
  // Hook it so the overlay hides exactly then, not on a guess.
  // We stamp __nookLoaded so a re-render (dev Fast Refresh resets React state but
  // does NOT reload the iframe) detects an already-loaded viewer and doesn't re-show
  // the spinner forever.
  const hookFirstFrame = useCallback(() => {
    const win = iframeRef.current?.contentWindow as
      | (Window & { __nookLoaded?: boolean; firstFrame?: () => void })
      | null
      | undefined;
    if (!win) return;
    if (win.__nookLoaded) {
      setStatus("ready");
      return;
    }
    win.firstFrame = () => {
      win.__nookLoaded = true;
      setStatus("ready");
    };
  }, []);

  useEffect(() => {
    hookFirstFrame();
  }, [hookFirstFrame]);

  // Once the splat renders and status flips to "ready", install scroll-wheel lock:
  // block zoom-out past the starting position so the user stays inside the room.
  // stopImmediatePropagation in capture phase prevents the viewer's canvas listener
  // from receiving blocked events. The figure-8 camera sway is disabled via &noanim
  // in the viewer URL (supported natively — no pointer-click hack needed).
  useEffect(() => {
    if (status !== "ready") return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    // Scroll lock
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) {
        if (zoomStepsRef.current <= 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
        } else {
          zoomStepsRef.current -= 1;
        }
      } else if (e.deltaY < 0) {
        zoomStepsRef.current += 1;
      }
    };
    doc.addEventListener("wheel", onWheel, { capture: true, passive: false });

    return () => {
      doc.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [status]);

  // Safety net: a viewer should never leave the user staring at an endless spinner.
  // Generous window because large splats (100 MB+) legitimately take a while to
  // download + render; we only want to surface Retry on a genuine hang.
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      setStatus((s) => (s === "loading" ? "error" : s));
    }, 120000);
    return () => clearTimeout(t);
  }, [status, plyUrl]);

  // Auto-dismiss the interaction hint shortly after the scene is ready.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setTimeout(() => setShowHint(false), 6000);
    return () => clearTimeout(t);
  }, [status]);

  // --- Drive the same-origin viewer directly (robust, no fake input guessing) ---
  const viewerDoc = () => iframeRef.current?.contentDocument ?? null;

  // Zoom by dispatching a wheel event the camera controller already listens for.
  // The handler lives on #ui (hidden by noui but still receives dispatched events);
  // we also hit the canvas as a fallback.
  const zoom = (direction: 1 | -1) => {
    const doc = viewerDoc();
    const win = iframeRef.current?.contentWindow as (Window & { WheelEvent: typeof WheelEvent }) | null;
    if (!doc || !win) return;
    const canvas = doc.getElementById("application-canvas");
    const rect = canvas?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    for (const id of ["ui", "application-canvas"]) {
      doc.getElementById(id)?.dispatchEvent(
        new win.WheelEvent("wheel", {
          deltaY: direction * 240,
          deltaMode: 0,
          clientX: cx,
          clientY: cy,
          bubbles: true,
          cancelable: true,
        })
      );
    }
    if (direction < 0) zoomStepsRef.current++;
    setShowHint(false);
  };

  // Recenter = trigger the viewer's own reset-camera button (works even hidden).
  const recenter = () => {
    (viewerDoc()?.getElementById("reset") as HTMLElement | null)?.click();
    zoomStepsRef.current = 0;
    setShowHint(false);
  };

  const retry = () => {
    setStatus("loading");
    zoomStepsRef.current = 0;
    const iframe = iframeRef.current;
    if (iframe) {
      // eslint-disable-next-line no-self-assign
      iframe.src = iframe.src;
    }
  };

  const btn =
    "flex items-center justify-center h-10 w-10 rounded-full bg-black/55 text-white text-lg " +
    "backdrop-blur-sm hover:bg-black/75 transition-colors select-none";

  return (
    <div className="relative w-full h-full bg-black">
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black text-white/80 pointer-events-none">
          <span className="inline-block h-6 w-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          <span className="text-sm">Loading 3D scene…</span>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black text-white/80">
          <span className="text-sm">This 3D scene is taking too long to load.</span>
          <button onClick={retry} className="text-sm bg-white text-black px-4 py-2 rounded-lg hover:opacity-90">
            Retry
          </button>
        </div>
      )}

      {/* Minimal, friendly controls — only once the scene is interactive */}
      {status === "ready" && (
        <>
          {showHint && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-black/60 text-white text-xs sm:text-sm backdrop-blur-sm pointer-events-none whitespace-nowrap">
              Drag to look around · scroll or pinch to zoom in
            </div>
          )}
          <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
            <button className={btn} onClick={() => zoom(-1)} aria-label="Zoom in" title="Zoom in">+</button>
            <button className={`${btn} text-base`} onClick={recenter} aria-label="Recenter view" title="Recenter view">⟲</button>
          </div>
        </>
      )}

      {renderer && (
        <iframe
          ref={iframeRef}
          src={src}
          className="w-full h-full border-0"
          style={{ minHeight: 400 }}
          allow="xr-spatial-tracking; fullscreen"
          title="3D Tour Viewer"
          onLoad={hookFirstFrame}
        />
      )}
    </div>
  );
}
