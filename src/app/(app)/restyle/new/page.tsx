"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ImagePlus, Sofa } from "lucide-react";
import { downscaleImage } from "@/lib/image-client";

export default function NewRestylePage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false); // only phones can actually take a photo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null); // capture="environment" → opens the camera on mobile

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setIsMobile(
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && matchMedia("(pointer: coarse)").matches),
      );
    });
    return () => { active = false; };
  }, []);

  // Paste from clipboard (Cmd+V / Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (loading) return;
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (i) => i.type.startsWith("image/"),
      );
      if (item) {
        const f = item.getAsFile();
        if (f) select(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loading]);

  // Selecting a photo only previews it — nothing is uploaded or processed until the
  // user confirms, so a wrong pick can be swapped out first.
  const select = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setError(null);
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setFile(f);
  };

  const reset = () => {
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirm = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      // Phone camera photos routinely exceed Vercel's 4.5 MB request-body limit — downscale
      // client-side first so the upload doesn't die with a bare "load failed".
      const small = await downscaleImage(file);
      const fd = new FormData();
      fd.append("photo", small);
      if (name.trim()) fd.append("title", name.trim());
      const res = await fetch("/api/restyle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
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
          Upload a room photo. We&apos;ll detect what&apos;s in it, then you can change anything — and
          toggle each change on or off.
        </p>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => select(e.target.files?.[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => select(e.target.files?.[0])} />

      {!preview ? (
        <div className="space-y-3">
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragging ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); select(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Sofa className="h-8 w-8 mx-auto mb-2 text-slate-400" strokeWidth={1.5} />
            <div className="text-sm">Drag &amp; drop, paste, or tap to choose</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-1">JPG or PNG · Cmd+V to paste from clipboard</div>
          </div>
          {isMobile ? (
            <button type="button" onClick={() => cameraInputRef.current?.click()}
              className="w-full bg-slate-900 text-white text-sm font-medium py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Camera className="h-4 w-4" /> Take a photo
            </button>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full bg-slate-900 text-white text-sm font-medium py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <ImagePlus className="h-4 w-4" /> Choose a photo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Room" className="w-full max-h-[50vh] object-contain rounded-2xl border border-[var(--border)] bg-black" />

          {loading ? (
            <div className="text-sm text-[var(--muted-foreground)] flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
              Setting up your room…
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">Is this the room you want to restyle?</p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Name this room</label>
                <input type="text" value={name} autoFocus
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirm(); }}
                  placeholder="e.g. Maple St living room"
                  className="w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400" />
                <p className="text-[11px] text-[var(--muted-foreground)]">Optional — you can rename it anytime.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={confirm}
                  className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold py-3 rounded-xl text-sm hover:opacity-90 transition-opacity">
                  Start restyling →
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="px-4 border border-[var(--border)] rounded-xl text-sm text-slate-700 hover:border-slate-400 transition-colors">
                  Choose a different photo
                </button>
              </div>
              <button type="button" onClick={reset}
                className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {error && <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
    </div>
  );
}
