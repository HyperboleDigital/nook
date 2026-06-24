"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function NewTourPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.type.startsWith("video/") || dropped.name.endsWith(".mov"))) {
      setFile(dropped);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);

      const res = await fetch("/api/tours", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Failed to create tour");
      router.push(`/tours/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">New 3D Tour</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Upload a walkthrough video. We&apos;ll generate a shareable 3D tour in 5–10 minutes.
        </p>
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
            className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Walkthrough video</label>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragging ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="text-sm">
                <div className="font-medium">{file.name}</div>
                <div className="text-[var(--muted-foreground)] mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="mt-2 text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="text-sm text-[var(--muted-foreground)]">
                <div className="text-2xl mb-2">📹</div>
                <div>Drag & drop a video, or click to browse</div>
                <div className="text-xs mt-1">MP4 or MOV · Max 2GB</div>
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

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!file || !title.trim() || loading}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {loading ? "Submitting…" : "Generate 3D Tour →"}
        </button>
      </form>
    </div>
  );
}
