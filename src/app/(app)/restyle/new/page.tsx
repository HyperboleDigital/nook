"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const THEMES = [
  { value: "modern", label: "Modern" },
  { value: "scandinavian", label: "Scandinavian" },
  { value: "mid-century", label: "Mid-Century" },
  { value: "industrial", label: "Industrial" },
  { value: "coastal", label: "Coastal" },
  { value: "japandi", label: "Japandi" },
  { value: "minimalist", label: "Minimalist" },
  { value: "luxe", label: "Luxe" },
];

export default function NewRestylePage() {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"theme" | "custom" | "remove-furniture">("theme");
  const [theme, setTheme] = useState("scandinavian");
  const [customStyle, setCustomStyle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  };

  const start = async () => {
    if (!photo) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", photo);
      fd.append("mode", mode);
      if (mode === "theme") fd.append("theme", theme);
      if (mode === "custom") fd.append("customStyle", customStyle);
      const res = await fetch("/api/restyle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restyle failed");
      router.push(`/restyle/${data.restyleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link href="/restyle" className="text-sm text-[var(--muted-foreground)] hover:underline mb-2 block">
          ← All restyles
        </Link>
        <h1 className="text-2xl font-bold mb-1">New Room Restyle</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Upload a room photo and pick a starting look. You can fine-tune everything next.
        </p>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {!preview ? (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            isDragging ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); pick(e.dataTransfer.files[0]); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-3xl mb-2">🛋️</div>
          <div className="text-sm">Drag & drop a room photo, or click to browse</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-1">JPG or PNG</div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Room" className="w-full max-h-[40vh] object-contain rounded-2xl border border-[var(--border)] bg-black" />
          <button type="button" onClick={() => { setPhoto(null); setPreview(null); }} className="text-xs text-[var(--muted-foreground)] hover:underline">
            ← Use a different photo
          </button>

          <div className="flex gap-2 text-sm">
            {(["theme", "custom", "remove-furniture"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-lg border ${mode === m ? "border-slate-900 bg-slate-50" : "border-[var(--border)]"}`}
              >
                {m === "theme" ? "Theme" : m === "custom" ? "Custom" : "Empty the room"}
              </button>
            ))}
          </div>

          {mode === "theme" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTheme(t.value)}
                  className={`text-sm rounded-xl border p-3 transition-colors ${
                    theme === t.value ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {mode === "custom" && (
            <input
              type="text"
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              placeholder="Describe the style, e.g. warm boho with terracotta and rattan"
              className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            />
          )}

          {mode === "remove-furniture" && (
            <p className="text-sm text-[var(--muted-foreground)]">
              We&apos;ll clear the room to bare floors and walls — a clean slate to restyle from.
            </p>
          )}

          <button
            type="button"
            onClick={start}
            disabled={loading || (mode === "custom" && !customStyle.trim())}
            className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {loading ? "Creating…" : "Create restyle →"}
          </button>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
