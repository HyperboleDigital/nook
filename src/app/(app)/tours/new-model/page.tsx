"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

type UploadStep = "idle" | "uploading" | "processing" | "done" | "error";

const isGlb = (f: File) =>
  f.name.toLowerCase().endsWith(".glb") || f.type === "model/gltf-binary";

export default function NewModelPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tipsOpen, setTipsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isGlb(dropped)) setFile(dropped);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setError(null);

    try {
      // Upload the GLB directly to Vercel Blob CDN. Meshy/Rodin exports can be
      // tens of MB, so use multipart (parallel chunks, no single-request cap).
      setStep("uploading");
      setProgress(0);

      const blob = await upload(
        `models/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/tours/upload-url",
          multipart: true,
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        }
      );

      setProgress(100);

      // Mesh tours need no GPU job — the GLB is already generated, so the tour
      // is created complete immediately.
      setStep("processing");
      const tourRes = await fetch("/api/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, modelUrl: blob.url, contentType: "mesh" }),
      });

      if (!tourRes.ok) {
        const d = await tourRes.json();
        throw new Error(d.error ?? "Failed to create tour");
      }

      const { id } = await tourRes.json();
      setStep("done");
      router.push(`/tours/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  const isLoading = step === "uploading" || step === "processing";
  const fileMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Upload 3D Model</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Upload a GLB dollhouse model (e.g. a floor plan run through Meshy, Rodin, or Tripo).
          It becomes an interactive, shareable 3D tour instantly — no processing wait.
        </p>
      </div>

      {/* How-to */}
      <div className="mb-6 border border-[var(--border)] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setTipsOpen(!tipsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-[var(--muted)] transition-colors"
        >
          <span>📋 How to make a dollhouse GLB</span>
          <span className="text-[var(--muted-foreground)]">{tipsOpen ? "▲" : "▼"}</span>
        </button>
        {tipsOpen && (
          <div className="px-4 pb-4 text-sm text-[var(--muted-foreground)] space-y-2 border-t border-[var(--border)] pt-3">
            <p className="text-xs uppercase tracking-wide text-[var(--foreground)] font-semibold">Best quality — from a 2D floor plan</p>
            <p><strong className="text-[var(--foreground)]">1. Build it in a CAD tool.</strong> Import the 2D floor plan into <strong className="text-[var(--foreground)]">Coohom</strong> or <strong className="text-[var(--foreground)]">Planner 5D</strong>, trace walls, and <strong className="text-[var(--foreground)]">set the scale</strong> from a known dimension. This gives accurate geometry an image-to-3D tool can&apos;t.</p>
            <p><strong className="text-[var(--foreground)]">2. Furnish &amp; finish to match the render.</strong> Use the client&apos;s 3D render as a side-by-side reference for furniture, floor color, and wall finishes.</p>
            <p><strong className="text-[var(--foreground)]">3. Export as GLB</strong> (may need a paid tier) <strong className="text-[var(--foreground)]">and upload here.</strong> It becomes an orbit-able dollhouse instantly.</p>
            <p className="text-xs pt-1"><strong className="text-[var(--foreground)]">No 2D plan, render only?</strong> Run the render through Meshy / Rodin / Tripo (image-to-3D) and export GLB — approximate geometry, but works.</p>
            <p className="text-xs">This is a dollhouse-style overview, best viewed by orbiting. For walk-through-inside rooms, use a video-based 3D tour. Full recipe: <code>docs/floor-plan-to-3d-recipe.md</code>.</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-2">Property title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 123 Oak Street, Austin TX"
            required
            disabled={isLoading}
            className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">3D model (GLB)</label>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
              isLoading
                ? "border-[var(--border)] opacity-50 cursor-default"
                : isDragging
                ? "border-slate-900 bg-slate-50 cursor-pointer"
                : "border-[var(--border)] hover:border-slate-400 cursor-pointer"
            }`}
            onDragOver={(e) => { if (!isLoading) { e.preventDefault(); setIsDragging(true); } }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={isLoading ? undefined : handleDrop}
            onClick={isLoading ? undefined : () => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-[var(--muted-foreground)] mt-1">{fileMB} MB</div>
                {!isLoading && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="mt-2 text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <div className="text-sm text-[var(--muted-foreground)]">
                <div className="text-2xl mb-2">🏠</div>
                <div>Drag & drop a GLB, or click to browse</div>
                <div className="text-xs mt-1">.glb file</div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,model/gltf-binary"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
          />
        </div>

        {step === "uploading" && (
          <div>
            <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-1">
              <span>Uploading model…</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-[var(--muted)] rounded-full h-2">
              <div
                className="bg-slate-900 h-2 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="text-sm text-[var(--muted-foreground)] text-center py-2">
            Creating tour…
          </div>
        )}

        {(step === "idle" || step === "error") && error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || !title.trim() || isLoading}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {step === "uploading"
            ? `Uploading… ${progress}%`
            : step === "processing"
            ? "Creating…"
            : "Create 3D Tour →"}
        </button>
      </form>
    </div>
  );
}
