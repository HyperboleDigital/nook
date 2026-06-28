"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import type { Restyle, RestyleEdit } from "@/types";

const THEMES: { label: string; desc: string }[] = [
  { label: "Modern", desc: "modern contemporary style" },
  { label: "Scandinavian", desc: "Scandinavian style — light woods, neutral tones, cozy minimalism" },
  { label: "Mid-Century", desc: "mid-century modern — warm woods, retro furniture, clean lines" },
  { label: "Industrial", desc: "industrial — exposed materials, metal, leather, moody tones" },
  { label: "Coastal", desc: "coastal — airy, light blues and whites, natural textures" },
  { label: "Japandi", desc: "Japandi — warm minimal, natural materials" },
  { label: "Minimalist", desc: "minimalist — uncluttered, neutral palette, clean forms" },
  { label: "Luxe", desc: "luxury — high-end finishes, rich materials, statement pieces" },
];

function editSummary(e: RestyleEdit): string {
  switch (e.kind) {
    case "item":
      return `${e.target_label ?? "Item"} → ${e.reference_url ? "reference photo" : e.instruction ?? "changed"}`;
    case "style":
      return `Style: ${e.instruction ?? ""}`.slice(0, 48);
    case "remove":
      return "Removed all furniture";
    default:
      return e.instruction ?? "Refinement";
  }
}

export default function RestyleWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [restyle, setRestyle] = useState<Restyle | null>(null);
  const [objects, setObjects] = useState<string[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<"flash" | "pro">("flash");

  // Add-an-item state
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [reference, setReference] = useState<File | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [customStyle, setCustomStyle] = useState("");
  const [refineText, setRefineText] = useState("");

  // Before/after slider
  const [compare, setCompare] = useState(50);
  const dragging = useRef(false);
  const imgWrapRef = useRef<HTMLDivElement>(null);
  const moveCompare = (clientX: number) => {
    const el = imgWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCompare(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  // Load project, then detect items on the ORIGINAL (one time).
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/restyles/${id}`);
      if (!active || !res.ok) return;
      const d: Restyle = await res.json();
      setRestyle(d);

      // Reuse the saved item list if we've already detected for this project — keeps
      // the chips stable (detection is non-deterministic) and saves a call.
      if (d.detected_objects && d.detected_objects.length > 0) {
        setObjects(d.detected_objects.map((o) => o.label));
        return;
      }

      setDetecting(true);
      try {
        const dr = await fetch("/api/restyle/detect", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: d.original_url, restyleId: id }),
        });
        const dj = await dr.json();
        if (active) setObjects((dj.objects ?? []).map((o: { label: string }) => o.label));
      } catch {
        if (active) setObjects([]); // proceed even if detection fails
      } finally {
        if (active) setDetecting(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  // Keep a ref to the latest restyle so the debounced commit reads current toggles.
  const restyleRef = useRef<Restyle | null>(null);
  useEffect(() => { restyleRef.current = restyle; }, [restyle]);

  const apply = (res: { url: string; edits: RestyleEdit[] }) =>
    setRestyle((prev) => (prev ? { ...prev, current_url: res.url, edits: res.edits } : prev));

  const addEdit = async (fields: Record<string, string>, refFile?: File | null) => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("model", model);
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      if (refFile) fd.append("reference", refFile);
      const r = await fetch(`/api/restyle/${id}/edits`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      apply(data);
      setSelectedLabel(null); setInstruction(""); setReference(null); setCustomStyle(""); setRefineText("");
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  // Toggling flips the switch instantly (optimistic) and schedules ONE render for
  // the final selection ~0.7s later — so rapid check/uncheck doesn't re-render
  // (or re-bill) for every intermediate combination.
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);

  const commitToggles = async () => {
    const edits = restyleRef.current?.edits ?? [];
    const states = Object.fromEntries(edits.map((e) => [e.id, e.active]));
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ states, model }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      apply(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); setPending(false); }
  };

  const scheduleCommit = () => {
    setPending(true);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(commitToggles, 700);
  };

  const toggle = (editId: string, activeState: boolean) => {
    // optimistic — flip the switch immediately
    setRestyle((prev) => prev ? { ...prev, edits: prev.edits?.map((e) => e.id === editId ? { ...e, active: activeState } : e) } : prev);
    scheduleCommit();
  };

  // Radio-select among an item's options: activate one (or none), deactivate the
  // other options for that same item.
  const selectOption = (targetLabel: string, editId: string | null) => {
    setRestyle((prev) => prev ? {
      ...prev,
      edits: prev.edits?.map((e) =>
        e.kind === "item" && e.target_label === targetLabel ? { ...e, active: e.id === editId } : e),
    } : prev);
    scheduleCommit();
  };

  const remove = async (editId: string) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/restyle/${id}/edits?editId=${editId}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      apply(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  // Hold on the setup screen until the room is loaded AND items are detected.
  if (!restyle || objects === null) {
    return (
      <div className="max-w-5xl">
        <div className="flex flex-col items-center justify-center gap-3 py-32 text-[var(--muted-foreground)]">
          <span className="inline-block h-7 w-7 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
          <span className="text-sm">Setting up your room…</span>
        </div>
      </div>
    );
  }

  const before = restyle.original_url;
  const after = restyle.current_url;
  const edits = restyle.edits ?? [];
  const canAddItem = !!selectedLabel && (!!instruction.trim() || !!reference);

  // Group item edits by item (each group = alternative options); other edits stand alone.
  const itemGroups = new Map<string, RestyleEdit[]>();
  const standalone: RestyleEdit[] = [];
  for (const e of edits) {
    if (e.kind === "item" && e.target_label) {
      const arr = itemGroups.get(e.target_label) ?? [];
      arr.push(e);
      itemGroups.set(e.target_label, arr);
    } else standalone.push(e);
  }

  return (
    <div className="max-w-5xl">
      <Link href="/restyle" className="text-sm text-[var(--muted-foreground)] hover:underline mb-3 block">← All restyles</Link>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6">
        {/* Image + before/after slider */}
        <div>
          <div className="relative inline-block w-full bg-black rounded-2xl overflow-hidden border border-[var(--border)]">
            {after === before ? (
              /* Nothing changed yet (or all changes toggled off) → no slider. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={after} alt="Room" className="block w-full max-h-[65vh] object-contain mx-auto" />
            ) : (
              <div
                ref={imgWrapRef}
                className="relative inline-block w-full select-none"
                onPointerDown={(e) => { dragging.current = true; moveCompare(e.clientX); }}
                onPointerMove={(e) => { if (dragging.current) moveCompare(e.clientX); }}
                onPointerUp={() => { dragging.current = false; }}
                onPointerLeave={() => { dragging.current = false; }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={after} alt="After" className="block w-full max-h-[65vh] object-contain mx-auto" draggable={false} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={before} alt="Before" draggable={false}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-white/90 pointer-events-none" style={{ left: `${compare}%` }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white shadow flex items-center justify-center text-slate-700 text-xs">⇆</div>
                </div>
                <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">Before</span>
                <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white pointer-events-none">After</span>
              </div>
            )}
            {(busy || pending) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
                <span className="inline-block h-7 w-7 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span className="text-sm">{pending && !busy ? "Updating…" : "Working…"}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <a href={after} download className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--muted)] ml-auto">Download</a>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted-foreground)]">Model</span>
            <div className="flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
              <button type="button" onClick={() => setModel("flash")} className={`px-3 py-1.5 ${model === "flash" ? "bg-slate-900 text-white" : "hover:bg-[var(--muted)]"}`}>Standard</button>
              <button type="button" onClick={() => setModel("pro")} className={`px-3 py-1.5 ${model === "pro" ? "bg-slate-900 text-white" : "hover:bg-[var(--muted)]"}`}>Pro</button>
            </div>
          </div>

          {/* Step: change an item */}
          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium">Change an item</div>
            {detecting ? (
              <p className="text-xs text-[var(--muted-foreground)]">Finding items…</p>
            ) : !objects || objects.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">No items detected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {objects.map((label) => (
                  <button key={label} type="button" onClick={() => { setSelectedLabel(label); setInstruction(""); setReference(null); }}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${selectedLabel === label ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--border)] hover:border-slate-400"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {selectedLabel && (
              <div className="space-y-2 pt-1">
                <input type="text" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                  placeholder={`change the ${selectedLabel}…`}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
                <button type="button" onClick={() => refInputRef.current?.click()} className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:bg-[var(--muted)]">
                  {reference ? `🖼 ${reference.name.slice(0, 16)}` : "Add reference photo"}
                </button>
                <input ref={refInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => setReference(e.target.files?.[0] ?? null)} />
                <button type="button" disabled={busy || !canAddItem}
                  onClick={() => addEdit({ kind: "item", targetLabel: selectedLabel, instruction: instruction.trim() }, reference)}
                  className="w-full bg-slate-900 text-white py-2.5 rounded-lg text-sm disabled:opacity-40 hover:opacity-90">Add change</button>
              </div>
            )}
          </div>

          {/* Step: whole-room changes */}
          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium">Whole-room changes</div>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((t) => (
                <button key={t.label} type="button" disabled={busy} onClick={() => addEdit({ kind: "style", instruction: t.desc })}
                  className="text-xs rounded-lg border border-[var(--border)] p-2 hover:border-slate-400 disabled:opacity-40">{t.label}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={customStyle} onChange={(e) => setCustomStyle(e.target.value)} placeholder="custom style…"
                className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
              <button type="button" disabled={busy || !customStyle.trim()} onClick={() => addEdit({ kind: "style", instruction: customStyle.trim() })}
                className="bg-slate-900 text-white px-4 rounded-lg text-sm disabled:opacity-40">Add</button>
            </div>
            <div className="flex gap-2">
              <input type="text" value={refineText} onChange={(e) => setRefineText(e.target.value)} placeholder="other change (e.g. add a plant)…"
                className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
              <button type="button" disabled={busy || !refineText.trim()} onClick={() => addEdit({ kind: "refine", instruction: refineText.trim() })}
                className="bg-slate-900 text-white px-4 rounded-lg text-sm disabled:opacity-40">Add</button>
            </div>
            <button type="button" disabled={busy} onClick={() => addEdit({ kind: "remove" })}
              className="w-full border border-[var(--border)] py-2 rounded-lg text-sm hover:bg-[var(--muted)] disabled:opacity-40">🧹 Remove all furniture</button>
          </div>

          {/* Your changes — item options (radio) + standalone toggles */}
          <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
            <div className="text-sm font-medium">Your changes</div>
            {edits.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">No changes yet — add one above.</p>
            ) : (
              <>
                {/* Item groups — click a thumbnail to apply that option (click again to
                    turn it off). Re-select the item above + Add change for more options. */}
                {[...itemGroups.entries()].map(([label, opts]) => (
                  <div key={label} className="space-y-1.5">
                    <div className="text-xs font-medium capitalize">{label}</div>
                    <div className="flex gap-2 flex-wrap">
                      {opts.map((e, i) => {
                        const sel = e.active;
                        return (
                          <div key={e.id} className="relative">
                            <button type="button" disabled={busy} onClick={() => selectOption(label, sel ? null : e.id)}
                              title={e.instruction ?? "reference"}
                              className={`h-16 w-16 rounded-lg overflow-hidden border-2 flex items-center justify-center text-[10px] text-center p-1 transition-colors ${
                                sel ? "border-slate-900 ring-2 ring-slate-900/30" : "border-[var(--border)] hover:border-slate-400"
                              }`}>
                              {e.reference_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={e.reference_url} alt={`Option ${i + 1}`} className="h-full w-full object-cover" />
                              ) : (
                                <span className="line-clamp-3 text-[var(--muted-foreground)]">{e.instruction ?? "change"}</span>
                              )}
                            </button>
                            <button type="button" disabled={busy} onClick={() => remove(e.id)}
                              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center hover:bg-black">×</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Standalone changes — simple on/off */}
                {standalone.map((e) => (
                  <div key={e.id} className="flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => toggle(e.id, !e.active)}
                      title={e.active ? "Turn off" : "Turn on"}
                      className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${e.active ? "bg-slate-900" : "bg-[var(--border)]"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${e.active ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                    <span className={`text-xs flex-1 truncate capitalize ${e.active ? "" : "text-[var(--muted-foreground)] line-through"}`}>{editSummary(e)}</span>
                    <button type="button" disabled={busy} onClick={() => remove(e.id)} className="text-[var(--muted-foreground)] hover:text-red-500 text-sm shrink-0">×</button>
                  </div>
                ))}
              </>
            )}
          </div>

          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">{error}</div>}
        </div>
      </div>
    </div>
  );
}
