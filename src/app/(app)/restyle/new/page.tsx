"use client";

import { useState, useRef } from "react";

type Theme = {
  value: string;
  label: string;
  desc: string;
};

const THEMES: Theme[] = [
  { value: "modern", label: "Modern", desc: "Clean, contemporary" },
  { value: "scandinavian", label: "Scandinavian", desc: "Light woods, cozy minimal" },
  { value: "mid-century", label: "Mid-Century", desc: "Warm woods, retro lines" },
  { value: "industrial", label: "Industrial", desc: "Metal, leather, moody" },
  { value: "coastal", label: "Coastal", desc: "Airy, light blues & whites" },
  { value: "japandi", label: "Japandi", desc: "Warm minimal, natural" },
  { value: "minimalist", label: "Minimalist", desc: "Uncluttered, neutral" },
  { value: "luxe", label: "Luxe", desc: "High-end, elegant" },
];

export default function RoomRestylePage() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [theme, setTheme] = useState("scandinavian");
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickFile = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
    setResult(null);
    setHistory([]);
    setError(null);
  };

  // First generation: restyle the uploaded photo into the chosen theme.
  const generate = async () => {
    if (!photo) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", photo);
      fd.append("theme", theme);
      const res = await fetch("/api/restyle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restyle failed");
      setResult(data.url);
      setHistory([data.url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // Iterative edit: transform the latest result with a text instruction.
  const refine = async () => {
    if (!result || !instruction.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const blob = await (await fetch(result)).blob();
      const fd = new FormData();
      fd.append("baseImage", blob, "base.png");
      fd.append("theme", theme);
      fd.append("instruction", instruction.trim());
      const res = await fetch("/api/restyle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Edit failed");
      setResult(data.url);
      setHistory((h) => [...h, data.url]);
      setInstruction("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Room Restyle</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Upload a photo of a room, pick a style, and see it reimagined. Then refine it —
          swap the couch, change the floors, rearrange — until it&apos;s right.
        </p>
      </div>

      {/* Step 1: photo */}
      {!photoPreview && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragging ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0]); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-3xl mb-2">🛋️</div>
          <div className="text-sm">Drag & drop a room photo, or click to browse</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-1">JPG or PNG</div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />

      {photoPreview && (
        <div className="space-y-5">
          {/* Image display: result (with before/after toggle) or the original */}
          <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result && !showBefore ? result : photoPreview}
              alt={result && !showBefore ? "Restyled room" : "Original room"}
              className="w-full max-h-[60vh] object-contain bg-black"
            />
            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
                <span className="inline-block h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span className="text-sm">Styling your room…</span>
              </div>
            )}
            {result && (
              <button
                type="button"
                onMouseDown={() => setShowBefore(true)}
                onMouseUp={() => setShowBefore(false)}
                onMouseLeave={() => setShowBefore(false)}
                onTouchStart={() => setShowBefore(true)}
                onTouchEnd={() => setShowBefore(false)}
                className="absolute bottom-3 left-3 text-xs bg-black/60 text-white px-3 py-1.5 rounded-full backdrop-blur-sm select-none"
              >
                {showBefore ? "Before" : "Hold to see before"}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setPhoto(null); setPhotoPreview(null); setResult(null); setHistory([]); }}
              className="text-xs text-[var(--muted-foreground)] hover:underline"
            >
              ← Use a different photo
            </button>
            {result && (
              <a
                href={result}
                download
                className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--muted)] ml-auto"
              >
                Download
              </a>
            )}
          </div>

          {/* Step 2: theme + generate */}
          <div>
            <label className="block text-sm font-medium mb-2">Style</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTheme(t.value)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    theme === t.value
                      ? "border-slate-900 bg-slate-50"
                      : "border-[var(--border)] hover:border-slate-400"
                  }`}
                >
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? "Working…" : result ? "Regenerate in this style →" : "Restyle this room →"}
          </button>

          {/* Step 3: iterative refine (after first result) */}
          {result && (
            <div className="border-t border-[var(--border)] pt-5">
              <label className="block text-sm font-medium mb-2">Refine it</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") refine(); }}
                  placeholder="e.g. change the couch to a tan leather sectional"
                  disabled={loading}
                  className="flex-1 border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={refine}
                  disabled={loading || !instruction.trim()}
                  className="bg-slate-900 text-white px-5 rounded-xl font-medium text-sm disabled:opacity-40 hover:opacity-90"
                >
                  Apply
                </button>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                Try: &quot;rearrange the furniture&quot;, &quot;lighter wood floors&quot;,
                &quot;add a large plant in the corner&quot;, &quot;change the TV to a bigger one&quot;.
              </p>

              {history.length > 1 && (
                <div className="flex gap-2 mt-4 overflow-x-auto">
                  {history.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setResult(url)}
                      className={`shrink-0 rounded-lg overflow-hidden border-2 ${
                        result === url ? "border-slate-900" : "border-transparent"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Version ${i + 1}`} className="h-16 w-24 object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
