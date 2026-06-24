"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReelStyle, ReelModel } from "@/lib/higgsfield";

const STYLES: { value: ReelStyle; label: string; desc: string }[] = [
  { value: "cinematic", label: "Cinematic", desc: "Smooth drone-like movements, golden light" },
  { value: "luxury", label: "Luxury", desc: "Elegant reveals, high-end lifestyle feel" },
  { value: "modern", label: "Modern", desc: "Clean, minimal, bright natural light" },
  { value: "warm", label: "Warm", desc: "Cozy, inviting, lifestyle-focused" },
];

const MODELS: { value: ReelModel; label: string; desc: string; credits: string }[] = [
  { value: "kling-3.0", label: "Kling 3.0", desc: "Fast, great for most listings", credits: "~6 credits" },
  { value: "veo-3.1", label: "Veo 3.1", desc: "Highest quality, cinematic output", credits: "~40 credits" },
];

export default function NewReelPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [style, setStyle] = useState<ReelStyle>("cinematic");
  const [model, setModel] = useState<ReelModel>("kling-3.0");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    setFiles((prev) => [...prev, ...dropped].slice(0, 20));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("address", address);
      formData.append("style", style);
      formData.append("model", model);
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/reels", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to create reel");
      router.push(`/reels/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">New Reel</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Upload property photos or a short clip. We&apos;ll generate a cinematic 9:16 video for social media.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2">Reel title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 123 Oak Street — Listing Reel"
            required
            className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Property address (optional)</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 123 Oak Street, Austin TX"
            className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Photos or clips</label>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {files.length > 0 ? (
              <div className="text-sm">
                <div className="font-medium">{files.length} file{files.length !== 1 ? "s" : ""} selected</div>
                <div className="text-[var(--muted-foreground)] mt-1 text-xs">
                  {files.map((f) => f.name).join(", ")}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFiles([]); }}
                  className="mt-2 text-xs text-red-500 hover:underline"
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="text-sm text-[var(--muted-foreground)]">
                <div className="text-2xl mb-2">🏠</div>
                <div>Drag & drop photos or a video clip</div>
                <div className="text-xs mt-1">JPG, PNG, MP4 · Up to 20 files</div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []).slice(0, 20);
              setFiles(picked);
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Style</label>
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStyle(s.value)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  style === s.value
                    ? "border-slate-900 bg-slate-50"
                    : "border-[var(--border)] hover:border-slate-400"
                }`}
              >
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">AI Model</label>
          <div className="space-y-2">
            {MODELS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setModel(m.value)}
                className={`w-full text-left rounded-xl border p-3 transition-colors flex items-center justify-between ${
                  model === m.value
                    ? "border-slate-900 bg-slate-50"
                    : "border-[var(--border)] hover:border-slate-400"
                }`}
              >
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{m.desc}</div>
                </div>
                <span className="text-xs text-[var(--muted-foreground)] shrink-0 ml-3">{m.credits}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={files.length === 0 || !title.trim() || loading}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Submitting…" : "Generate Reel →"}
        </button>
      </form>
    </div>
  );
}
