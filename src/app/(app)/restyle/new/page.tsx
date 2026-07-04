"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Camera, ImagePlus, UploadCloud, Check, ChevronLeft,
  Lightbulb, Footprints, Maximize, Sofa, Bed, UtensilsCrossed, Laptop, LayoutGrid, MoreHorizontal,
} from "lucide-react";
import { downscaleImage } from "@/lib/image-client";
import { Button, Input, Spinner, StatusBanner } from "../[id]/ui";
import { cn } from "@/lib/utils";

type Step = "ready" | "photo" | "roomType" | "confirm";
const STEPS: Step[] = ["ready", "photo", "roomType", "confirm"];

const ROOM_TYPES: { value: string; label: string; icon: typeof Sofa }[] = [
  { value: "living_room", label: "Living room", icon: Sofa },
  { value: "bedroom", label: "Bedroom", icon: Bed },
  { value: "dining", label: "Dining", icon: UtensilsCrossed },
  { value: "home_office", label: "Home office", icon: Laptop },
  { value: "multi_use", label: "Multi-use room", icon: LayoutGrid },
  { value: "other", label: "Other", icon: MoreHorizontal },
];

export default function NewRestylePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("ready");
  const [file, setFile] = useState<File | null>(null);
  const [roomType, setRoomType] = useState<string | null>(null);
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

  // Selecting a photo only previews it — nothing is uploaded or processed until the
  // user confirms, so a wrong pick can be swapped out first. Advances to the room-type step.
  const select = useCallback((f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setError(null);
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setFile(f);
    setStep("roomType");
  }, []);

  // Paste from clipboard (Cmd+V / Ctrl+V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (loading) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (item) {
        const f = item.getAsFile();
        if (f) select(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loading, select]);

  const reset = () => {
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
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
      if (roomType) fd.append("room_type", roomType);
      const res = await fetch("/api/restyle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      router.push(`/restyle/${data.restyleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/restyle" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
          ← All restyles
        </Link>
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              i <= stepIndex ? "bg-[var(--foreground)]" : "bg-[var(--border)]",
            )} />
          ))}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => select(e.target.files?.[0])} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => select(e.target.files?.[0])} />

      {step === "ready" && (
        <div className="rounded-3xl bg-[var(--card)] shadow-[var(--shadow-soft)] p-6 space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Get your room ready</h1>
            <p className="text-[var(--muted-foreground)] text-sm">A few quick tips for the best result.</p>
          </div>
          <ul className="space-y-3">
            {[
              { icon: Lightbulb, text: "Good, even lighting" },
              { icon: Footprints, text: "Keep the floor visible" },
              { icon: Maximize, text: "Step back to fit the whole room" },
              { icon: Camera, text: "Landscape works best" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
          <Button variant="primary" size="lg" className="w-full" onClick={() => setStep("photo")}>
            I&apos;m ready
          </Button>
        </div>
      )}

      {step === "photo" && (
        <div className="space-y-3">
          <button type="button" onClick={() => setStep("ready")}
            className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Add your room photo</h1>
            <p className="text-[var(--muted-foreground)] text-sm">
              We&apos;ll detect what&apos;s in it, then you can change anything — and toggle each change on or off.
            </p>
          </div>
          <div
            className={cn(
              "rounded-3xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
              isDragging ? "border-[var(--primary)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--foreground)]",
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); select(e.dataTransfer.files[0]); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="h-8 w-8 mx-auto mb-2 text-[var(--muted-foreground)]" strokeWidth={1.5} />
            <div className="text-sm">Drag &amp; drop, paste, or tap to choose</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-1">JPG or PNG · Cmd+V to paste from clipboard</div>
          </div>
          {isMobile ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="h-4 w-4" /> Take a photo
            </Button>
          ) : (
            <Button variant="primary" size="lg" className="w-full" onClick={() => fileInputRef.current?.click()}>
              <ImagePlus className="h-4 w-4" /> Choose a photo
            </Button>
          )}
        </div>
      )}

      {step === "roomType" && (
        <div className="space-y-3">
          <button type="button" onClick={() => { reset(); setStep("photo"); }}
            className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">What room is this?</h1>
            <p className="text-[var(--muted-foreground)] text-sm">Optional — helps us tailor suggestions.</p>
          </div>
          <div className="space-y-2">
            {ROOM_TYPES.map(({ value, label, icon: Icon }) => {
              const selected = roomType === value;
              return (
                <button key={value} type="button" onClick={() => setRoomType(value)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-2xl border bg-[var(--card)] p-3 text-left transition-colors",
                    selected ? "border-[var(--foreground)]" : "border-[var(--border)] hover:border-[var(--foreground)]",
                  )}>
                  <span className="h-12 w-12 rounded-xl bg-[var(--muted)] flex items-center justify-center shrink-0 text-[var(--muted-foreground)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  {selected && <Check className="h-4 w-4 text-[var(--foreground)] shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" onClick={() => setStep("confirm")}>
              Continue
            </Button>
            <Button variant="ghost" size="lg" onClick={() => { setRoomType(null); setStep("confirm"); }}>
              Skip
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <button type="button" onClick={() => setStep("roomType")}
            className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>

          {preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="Room" className="w-full max-h-[50vh] object-contain rounded-2xl overflow-hidden bg-black" />
          )}

          {loading ? (
            <div className="text-sm text-[var(--muted-foreground)] flex items-center gap-2">
              <Spinner /> Setting up your room…
            </div>
          ) : (
            <>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Your room is ready</h1>
                <p className="text-sm text-[var(--muted-foreground)] mt-0.5">Is this the room you want to restyle?</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Name this room</label>
                <Input type="text" value={name} autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
                  placeholder="e.g. Maple St living room" />
                <p className="text-[11px] text-[var(--muted-foreground)]">Optional — you can rename it anytime.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="lg" className="flex-1" onClick={confirm}>
                  <Check className="h-4 w-4" /> Start designing
                </Button>
                <Button variant="outline" size="lg" onClick={() => { reset(); setStep("photo"); }}>
                  Choose different photo
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <StatusBanner variant="error" className="mt-4">{error}</StatusBanner>}
    </div>
  );
}
