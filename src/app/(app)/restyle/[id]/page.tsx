"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import type { Restyle } from "@/types";

interface DetectedObjectClient {
  label: string;
  box_2d: [number, number, number, number];
}

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

export default function RestyleWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [restyle, setRestyle] = useState<Restyle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<"flash" | "pro">("flash");
  // Before/after compare slider: % width of the "before" image shown from the left
  // (left of the handle = Before, right = After).
  const [compare, setCompare] = useState(50);
  const dragging = useRef(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);

  const moveCompare = (clientX: number) => {
    const el = imgWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setCompare(Math.max(0, Math.min(100, pct)));
  };

  // Controls
  const [theme, setTheme] = useState("scandinavian");
  const [customStyle, setCustomStyle] = useState("");
  const [refine, setRefine] = useState("");

  // Tap-to-select editing. Detection is cached per image URL (and persisted in the
  // DB via versions) so we never re-run — or re-bill — Gemini for an image we've seen.
  const [editMode, setEditMode] = useState(false);
  const [objectsCache, setObjectsCache] = useState<Record<string, DetectedObjectClient[]>>({});
  const [detecting, setDetecting] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [reference, setReference] = useState<File | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const seedCache = (r: Restyle) => {
    const seed: Record<string, DetectedObjectClient[]> = {};
    (r.versions ?? []).forEach((v) => { if (v.objects) seed[v.image_url] = v.objects as DetectedObjectClient[]; });
    setObjectsCache((c) => ({ ...seed, ...c }));
  };

  const refresh = async (): Promise<Restyle | null> => {
    const res = await fetch(`/api/restyles/${id}`);
    if (!res.ok) return null;
    const d: Restyle = await res.json();
    setRestyle(d);
    seedCache(d);
    return d;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/restyles/${id}`);
      if (!active || !res.ok) return;
      const d: Restyle = await res.json();
      setRestyle(d);
      const seed: Record<string, DetectedObjectClient[]> = {};
      (d.versions ?? []).forEach((v) => { if (v.objects) seed[v.image_url] = v.objects as DetectedObjectClient[]; });
      setObjectsCache(seed);
    })();
    return () => { active = false; };
  }, [id]);

  // Any generation: POST /api/restyle with this project's id, then refresh.
  const generate = async (fields: Record<string, string>, refFile?: File | null) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("restyleId", id);
      fd.append("model", model);
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      if (refFile) fd.append("reference", refFile);
      const res = await fetch("/api/restyle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const d = await refresh();
      setSelected(null);
      setEditInstruction("");
      setReference(null);
      // Image changed → detect on the new image (cache-guarded) if still editing.
      if (editMode && d) detect(d.current_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const detect = async (url: string) => {
    if (!url || objectsCache[url]) return; // already detected — no re-run, no re-bill
    setDetecting(true);
    setError(null);
    try {
      const res = await fetch("/api/restyle/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, restyleId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Detect failed");
      setObjectsCache((c) => ({ ...c, [url]: data.objects ?? [] }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detect failed");
    } finally {
      setDetecting(false);
    }
  };

  const toggleEdit = () => {
    const next = !editMode;
    setEditMode(next);
    setSelected(null);
    if (next && restyle) detect(restyle.current_url);
  };

  const applyEdit = () => {
    if (selected === null || !objects) return;
    if (!editInstruction.trim() && !reference) return; // need an instruction or a reference
    generate(
      { mode: "edit", targetLabel: objects[selected].label, instruction: editInstruction.trim() },
      reference
    );
  };

  const revert = async (url: string) => {
    setBusy(true);
    await fetch(`/api/restyles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentUrl: url }),
    });
    await refresh();
    setSelected(null);
    setBusy(false);
  };

  if (!restyle) {
    return <div className="max-w-4xl"><div className="h-8 w-40 bg-[var(--muted)] rounded animate-pulse" /></div>;
  }

  // "After" is the current image; "Before" is the version we edited from (the one
  // just before the current in history), falling back to the original upload.
  const after = restyle.current_url;
  const versions = restyle.versions ?? [];
  const curIdx = versions.findIndex((v) => v.image_url === after);
  const before = curIdx > 0 ? versions[curIdx - 1].image_url : restyle.original_url;
  const objects = objectsCache[after] ?? null;

  return (
    <div className="max-w-5xl">
      <Link href="/restyle" className="text-sm text-[var(--muted-foreground)] hover:underline mb-3 block">
        ← All restyles
      </Link>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        {/* Image + overlays */}
        <div>
          <div className="relative inline-block w-full bg-black rounded-2xl overflow-hidden border border-[var(--border)]">
            <div
              ref={imgWrapRef}
              className="relative inline-block w-full select-none"
              onPointerDown={!editMode ? (e) => { dragging.current = true; moveCompare(e.clientX); } : undefined}
              onPointerMove={!editMode ? (e) => { if (dragging.current) moveCompare(e.clientX); } : undefined}
              onPointerUp={() => { dragging.current = false; }}
              onPointerLeave={() => { dragging.current = false; }}
            >
              {editMode ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={after} alt="Room" className="block w-full max-h-[65vh] object-contain mx-auto" />
                  {/* Invisible tap targets — detection drives the chip list; boxes
                      aren't drawn (imprecise boxes are more confusing than helpful). */}
                  {objects?.map((o, i) => {
                    const [ymin, xmin, ymax, xmax] = o.box_2d;
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={o.label}
                        onClick={() => { setSelected(i); setEditInstruction(""); }}
                        style={{
                          position: "absolute",
                          top: `${ymin / 10}%`, left: `${xmin / 10}%`,
                          width: `${(xmax - xmin) / 10}%`, height: `${(ymax - ymin) / 10}%`,
                        }}
                        className="cursor-pointer"
                      />
                    );
                  })}
                </>
              ) : (
                <>
                  {/* After is the base (right side); Before is clipped onto the left. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={after} alt="After" className="block w-full max-h-[65vh] object-contain mx-auto" draggable={false} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={before}
                    alt="Before"
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                  />
                  {/* Drag handle */}
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none" style={{ left: `${compare}%` }}>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white shadow flex items-center justify-center text-slate-700 text-xs">⇆</div>
                  </div>
                  <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">Before</span>
                  <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">After</span>
                </>
              )}
            </div>

            {(busy || detecting) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
                <span className="inline-block h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span className="text-sm">{detecting ? "Finding items…" : "Working…"}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button
              type="button"
              onClick={toggleEdit}
              className={`text-xs px-3 py-1.5 rounded-full ${editMode ? "bg-slate-900 text-white" : "bg-[var(--muted)]"}`}
            >
              {editMode ? "Done editing items" : "Edit items"}
            </button>
            <a href={after} download className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--muted)] ml-auto">
              Download
            </a>
          </div>

          {/* Version history — what changed + any reference used */}
          {restyle.versions && restyle.versions.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-[var(--muted-foreground)] mb-2">History</div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {restyle.versions.map((v, i) => (
                  <button key={v.id} type="button" onClick={() => revert(v.image_url)} title="Revert to this version"
                    className="shrink-0 w-28 text-left">
                    <div className={`relative rounded-lg overflow-hidden border-2 ${restyle.current_url === v.image_url ? "border-slate-900" : "border-transparent"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.image_url} alt={v.label ?? "version"} className="h-20 w-28 object-cover" />
                      {v.reference_url && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={v.reference_url} alt="reference used" title="Reference photo used"
                          className="absolute bottom-1 right-1 h-8 w-8 rounded border-2 border-white object-cover shadow" />
                      )}
                    </div>
                    <div className="text-[11px] mt-1 leading-tight truncate capitalize">
                      <span className="text-[var(--muted-foreground)]">{i + 1}. </span>{v.label ?? "Version"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-5">
          {/* Image model selector */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted-foreground)]">Model</span>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
              <button type="button" onClick={() => setModel("flash")}
                className={`px-3 py-1.5 ${model === "flash" ? "bg-slate-900 text-white" : "hover:bg-[var(--muted)]"}`}>
                Standard
              </button>
              <button type="button" onClick={() => setModel("pro")}
                className={`px-3 py-1.5 ${model === "pro" ? "bg-slate-900 text-white" : "hover:bg-[var(--muted)]"}`}>
                Pro
              </button>
            </div>
          </div>

          {editMode ? (
            <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="text-sm font-medium">Edit an item</div>
              {!objects ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {detecting ? "Finding items…" : "Couldn't load items — toggle Edit items again."}
                </p>
              ) : objects.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">No items detected — try the Refine box instead.</p>
              ) : (
                <>
                  {/* Clean item list — tap a chip (or the photo) to pick something */}
                  <div className="flex flex-wrap gap-1.5">
                    {objects.map((o, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setSelected(i); setEditInstruction(""); setReference(null); }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
                          selected === i ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--border)] hover:border-slate-400"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>

                  {selected === null ? (
                    <p className="text-xs text-[var(--muted-foreground)]">Pick an item above (or tap it on the photo) to change it.</p>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={editInstruction}
                        onChange={(e) => setEditInstruction(e.target.value)}
                        placeholder="change to sage green…"
                        className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                      />
                      <div>
                        <button type="button" onClick={() => refInputRef.current?.click()} className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--muted)]">
                          {reference ? `🖼 ${reference.name.slice(0, 18)}` : "Add reference photo (swap to match)"}
                        </button>
                        <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => setReference(e.target.files?.[0] ?? null)} />
                      </div>
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        Add a reference photo to replace the {objects[selected].label} with that exact item, type a change, or both.
                      </p>
                      <button type="button" onClick={applyEdit} disabled={busy || (!editInstruction.trim() && !reference)}
                        className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm disabled:opacity-40 hover:opacity-90">
                        Apply change
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Restyle</label>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => (
                    <button key={t.value} type="button" onClick={() => setTheme(t.value)}
                      className={`text-sm rounded-lg border p-2.5 transition-colors ${theme === t.value ? "border-slate-900 bg-slate-50" : "border-[var(--border)] hover:border-slate-400"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => generate({ mode: "theme", theme })} disabled={busy}
                  className="w-full mt-2 bg-slate-900 text-white py-2.5 rounded-lg text-sm disabled:opacity-40 hover:opacity-90">
                  Apply style
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Custom style</label>
                <div className="flex gap-2">
                  <input type="text" value={customStyle} onChange={(e) => setCustomStyle(e.target.value)}
                    placeholder="warm boho, terracotta & rattan"
                    className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
                  <button type="button" onClick={() => generate({ mode: "custom", customStyle })} disabled={busy || !customStyle.trim()}
                    className="bg-slate-900 text-white px-4 rounded-lg text-sm disabled:opacity-40 hover:opacity-90">Go</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Refine</label>
                <div className="flex gap-2">
                  <input type="text" value={refine} onChange={(e) => setRefine(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && refine.trim()) generate({ mode: "refine", instruction: refine }); }}
                    placeholder="lighter wood floors, add a plant"
                    className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
                  <button type="button" onClick={() => generate({ mode: "refine", instruction: refine })} disabled={busy || !refine.trim()}
                    className="bg-slate-900 text-white px-4 rounded-lg text-sm disabled:opacity-40 hover:opacity-90">Go</button>
                </div>
              </div>

              <button type="button" onClick={() => generate({ mode: "remove-furniture" })} disabled={busy}
                className="w-full border border-[var(--border)] py-2.5 rounded-lg text-sm hover:bg-[var(--muted)] disabled:opacity-40">
                🧹 Remove all furniture
              </button>
            </>
          )}

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
        </div>
      </div>
    </div>
  );
}
