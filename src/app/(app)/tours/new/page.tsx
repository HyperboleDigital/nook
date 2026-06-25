"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";

type UploadStep = "idle" | "uploading" | "processing" | "done" | "error";

export default function NewTourPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<UploadStep>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tipsOpen, setTipsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type.startsWith("video/")) setFile(dropped);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setError(null);

    try {
      // Step 1: Upload video directly to Vercel Blob CDN (handles files up to 2 GB)
      setStep("uploading");
      setProgress(0);

      const blob = await upload(
        `tours/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        file,
        {
          access: "public",
          handleUploadUrl: "/api/tours/upload-url",
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        }
      );

      setProgress(100);

      // Step 2: Create tour record and trigger Modal GPU worker
      setStep("processing");
      const tourRes = await fetch("/api/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, videoUrl: blob.url }),
      });

      if (!tourRes.ok) {
        const d = await tourRes.json();
        throw new Error(d.error ?? "Failed to create tour");
      }

      const { id } = await tourRes.json();
      setStep("done");
      router.push(`/tours/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("error");
    }
  };

  const isLoading = step === "uploading" || step === "processing";

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">New 3D Tour</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Upload a walkthrough video. We&apos;ll generate a shareable 3D tour in 30–45 minutes.
        </p>
      </div>

      {/* Capture Tips */}
      <div className="mb-6 border border-[var(--border)] rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setTipsOpen(!tipsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-[var(--muted)] transition-colors"
        >
          <span>📋 Tips for a great scan</span>
          <span className="text-[var(--muted-foreground)]">{tipsOpen ? "▲" : "▼"}</span>
        </button>
        {tipsOpen && (
          <div className="px-4 pb-4 text-sm text-[var(--muted-foreground)] space-y-2 border-t border-[var(--border)] pt-3">
            <p>• Tape X markers on white walls every 2–3 ft so the algorithm has feature points</p>
            <p>• Walk at a slow, steady pace — faster than a stroll, slower than normal walking</p>
            <p>• Use indoor lighting (lamps + overhead). Avoid shooting directly into windows</p>
            <p>• Aim for 70%+ overlap between adjacent views — pause briefly at each corner</p>
            <p>• Record at 1080p or higher. Avoid digital zoom</p>
            <p>• A 3-bed home takes ~3–5 minutes of footage</p>
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
          <label className="block text-sm font-medium mb-2">Walkthrough video</label>
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
                <div className="text-[var(--muted-foreground)] mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
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
                <div className="text-2xl mb-2">📹</div>
                <div>Drag & drop a video, or click to browse</div>
                <div className="text-xs mt-1">MP4 or MOV · up to 2 GB</div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mov"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
          />
        </div>

        {/* Upload progress bar */}
        {step === "uploading" && (
          <div>
            <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-1">
              <span>Uploading video…</span>
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
            Starting 3D processing…
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
            ? "Starting…"
            : "Generate 3D Tour →"}
        </button>
      </form>
    </div>
  );
}
