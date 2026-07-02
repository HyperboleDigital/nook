"use client";

import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { SectionLabel } from "./ui";

export default function VersionsStrip({ ws }: { ws: RestyleWorkspace }) {
  const { restyle, renders, previewUrl, setPreviewUrl } = ws;
  if (!restyle || renders.length === 0) return null;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <SectionLabel>Versions</SectionLabel>
        {previewUrl && (
          <button type="button" onClick={() => setPreviewUrl(null)}
            className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline transition-colors">
            Latest
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setPreviewUrl(restyle.original_url)} title="Original"
          className={`relative shrink-0 h-16 w-16 overflow-hidden border-2 transition-colors ${
            previewUrl === restyle.original_url ? "border-[var(--primary)]" : "border-[var(--border)] hover:border-[var(--foreground)]"
          }`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={restyle.original_url} alt="Original" className="h-full w-full object-cover" />
          <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/60 text-white py-0.5">Original</span>
        </button>
        {renders.map((r, i) => {
          const isViewed = previewUrl ? previewUrl === r.image_url : r.image_url === restyle.current_url;
          return (
            <button key={r.id} type="button" onClick={() => setPreviewUrl(r.image_url)} title={`Version ${i + 1}`}
              className={`relative shrink-0 h-16 w-16 overflow-hidden border-2 transition-colors ${
                isViewed ? "border-[var(--primary)]" : "border-[var(--border)] hover:border-[var(--foreground)]"
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image_url} alt={`Version ${i + 1}`} className="h-full w-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/60 text-white py-0.5">v{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
