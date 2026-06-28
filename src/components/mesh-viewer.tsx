"use client";

import { useState, useRef, useEffect } from "react";

interface MeshViewerProps {
  modelUrl: string;
}

// Minimal typing for the <model-viewer> custom element so TSX accepts it.
// model-viewer is a web component (Google) — it renders GLB meshes with built-in
// orbit/zoom controls. We use it for "dollhouse" tours (a GLB generated from a
// floor plan by Meshy/Rodin/Tripo), as opposed to the splat path (TourViewer).
type ModelViewerProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement> & {
    src?: string;
    alt?: string;
    "camera-controls"?: boolean;
    "auto-rotate"?: boolean;
    "auto-rotate-delay"?: number;
    "rotation-per-second"?: string;
    "touch-action"?: string;
    "shadow-intensity"?: string;
    "shadow-softness"?: string;
    "environment-image"?: string;
    "tone-mapping"?: string;
    "camera-orbit"?: string;
    "min-camera-orbit"?: string;
    "max-camera-orbit"?: string;
    "field-of-view"?: string;
    exposure?: string;
    "interaction-prompt"?: string;
  },
  HTMLElement
>;

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerProps;
    }
  }
}

export default function MeshViewer({ modelUrl }: MeshViewerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const ref = useRef<HTMLElement>(null);

  // Load the web component on the client only (it touches `window`/customElements,
  // which are undefined during SSR).
  useEffect(() => {
    import("@google/model-viewer").catch(() => setStatus("error"));
  }, []);

  // model-viewer fires "load" when the GLB is decoded and "error" on failure.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onLoad = () => setStatus("ready");
    const onError = () => setStatus("error");
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, []);

  // Soft light "studio" gradient reads as premium archviz/product-shot and makes
  // a gray dollhouse pop far more than a flat black void. model-viewer renders
  // transparent over this when no skybox is set.
  const studioBg =
    "radial-gradient(circle at 50% 35%, #f4f5f7 0%, #dfe2e7 55%, #c4c8d0 100%)";

  return (
    <div className="relative w-full h-full" style={{ background: studioBg }}>
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-slate-600 pointer-events-none">
          <span className="inline-block h-6 w-6 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
          <span className="text-sm">Loading 3D model…</span>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-slate-600">
          <span className="text-sm">This 3D model couldn&apos;t be loaded.</span>
        </div>
      )}

      {/*
        environment-image="neutral" + tone-mapping="neutral": image-based lighting
        for realistic, even shading. shadow-intensity/softness: a soft contact
        shadow that grounds the model instead of letting it float.
      */}
      <model-viewer
        ref={ref}
        src={modelUrl}
        alt="Interactive 3D model"
        camera-controls
        auto-rotate
        auto-rotate-delay={3000}
        rotation-per-second="18deg"
        touch-action="pan-y"
        environment-image="neutral"
        tone-mapping="neutral"
        exposure="1.1"
        shadow-intensity="0.9"
        shadow-softness="0.85"
        interaction-prompt="none"
        style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
      />
    </div>
  );
}
