"use client";

import { useState, useRef, useEffect } from "react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { card, inp, stageBtn, chip } from "./shared";

// Two mutually-exclusive intents. "Empty" clears everything and renders in one shot.
// "Restyle" is a one-screen builder: stage as many swap/add changes as you like, then Generate.
type Mode = "restyle" | "empty";
type SrcMode = "link" | "photo" | "describe";

const MODES: { key: Mode; title: string; desc: string; icon: string }[] = [
  { key: "restyle", title: "Add or replace items", desc: "Swap pieces that are here, or bring in new ones", icon: "🛋️" },
  { key: "empty", title: "Empty the room", desc: "Remove all the furniture for a blank space", icon: "🧹" },
];

/** Friendly store name from a product URL, for "View on <store>". */
function storeName(url: string | null | undefined): string {
  if (!url) return "store";
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (/amazon\./.test(h)) return "Amazon";
    if (/wayfair\./.test(h)) return "Wayfair";
    if (/walmart\./.test(h)) return "Walmart";
    if (/homedepot\./.test(h)) return "Home Depot";
    if (/target\./.test(h)) return "Target";
    if (/lowes\./.test(h)) return "Lowe's";
    return h.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  } catch { return "store"; }
}

/** Internal 0–10 score → friendly word + color. */
function matchWord(score: number | null, exact: boolean): { label: string; cls: string } {
  if (score == null) return { label: exact ? "Match" : "Similar", cls: "bg-slate-100 text-slate-500" };
  if (score >= 8) return { label: "Great match", cls: "bg-emerald-100 text-emerald-700" };
  if (score >= 5) return { label: "Close match", cls: "bg-amber-100 text-amber-700" };
  return { label: "Similar", cls: "bg-slate-100 text-slate-500" };
}

export default function RestyleWizard({
  ws, startStep = 1, minStep = 1, initialMode = null, baseImageUrl, onDone, onCancel,
}: {
  ws: RestyleWorkspace;
  startStep?: number;
  minStep?: number;
  initialMode?: Mode | null;
  baseImageUrl?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(startStep);
  const [mode, setMode] = useState<Mode | null>(initialMode);

  // Builder composer
  const [composing, setComposing] = useState(false);
  const [current, setCurrent] = useState<{ label: string; mode: "swap" | "add" } | null>(null);
  const [srcMode, setSrcMode] = useState<SrcMode>("link");
  const [descText, setDescText] = useState("");
  const [addLabelDraft, setAddLabelDraft] = useState("");
  const [missingDraft, setMissingDraft] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Found matches cached per item label so revisiting doesn't re-search (saves credits).
  const [candidatesByLabel, setCandidatesByLabel] = useState<Record<string, ShoppingResult[]>>({});

  const id = ws.id;

  // ── per-room cache: restore on mount, persist on change ── (hooks must stay unconditional)
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(`nook-restyle-${id}`);
        if (!raw) return;
        const { ts, candidatesByLabel: saved } = JSON.parse(raw) as { ts: number; candidatesByLabel: Record<string, ShoppingResult[]> };
        if (Date.now() - ts < 24 * 60 * 60 * 1000 && saved) setCandidatesByLabel(saved);
        else localStorage.removeItem(`nook-restyle-${id}`);
      } catch { /* ignore */ }
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    try { localStorage.setItem(`nook-restyle-${id}`, JSON.stringify({ ts: Date.now(), candidatesByLabel })); } catch { /* quota */ }
  }, [id, candidatesByLabel]);

  // Mirror live search results into the per-label cache.
  useEffect(() => {
    const lbl = current?.label?.toLowerCase();
    const caps = ws.candidates;
    if (!lbl || !caps || !caps.length) return;
    let active = true;
    Promise.resolve().then(() => { if (active) setCandidatesByLabel(prev => ({ ...prev, [lbl]: caps })); });
    return () => { active = false; };
  }, [ws.candidates, current?.label]);

  if (!ws.restyle) return null;
  const { restyle, objects, edits, activeEdits } = ws;
  const stagedItems = activeEdits.filter(e => e.kind === "item" || e.kind === "add");
  const hasRemoveAll = edits.some(e => e.kind === "remove" && e.active);

  // ── handlers ──
  const clearPending = () => {
    setPendingPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPendingFile(null);
  };
  const pickPending = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setPendingPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setPendingFile(f);
  };
  const resetSourcing = () => {
    ws.setProductUrl(""); ws.setCandidates(null); ws.setSearchError(null); ws.clearLastProduct();
    setDescText(""); setSrcMode("link"); clearPending();
  };

  // Pick the item to source in the composer; load any cached matches for it.
  const chooseItem = (label: string, m: "swap" | "add") => {
    const l = label.trim(); if (!l) return;
    resetSourcing();
    setCurrent({ label: l, mode: m });
    setShowMissing(false); setMissingDraft(""); setAddLabelDraft("");
    const cached = candidatesByLabel[l.toLowerCase()];
    if (cached?.length) ws.setCandidates(cached);
  };
  const addMissingItem = async (label: string) => {
    const l = label.trim(); if (!l) return;
    setShowMissing(false); setMissingDraft("");
    await ws.addCustomItem(l);
    chooseItem(l, "swap");
  };
  // Compose another after one is staged.
  const nextChange = () => { setCurrent(null); resetSourcing(); };
  const closeComposer = () => { setComposing(false); setCurrent(null); resetSourcing(); };

  const uploadInspo = async (file: File) => { await ws.uploadPhotoProduct(file); ws.runVisualSearch(file); };
  const confirmPending = async () => { const f = pendingFile; if (!f) return; clearPending(); await uploadInspo(f); };

  const currentStaged = !!ws.lastProduct ||
    (current ? edits.some(e => e.target_label?.toLowerCase() === current.label.toLowerCase() && (e.buy_url || e.instruction || e.reference_url)) : false);

  const displayCandidates = ws.candidates ?? (current ? candidatesByLabel[current.label.toLowerCase()] ?? null : null);

  const onGenerate = async () => { if (await ws.generate()) onDone(); };
  const onEmptyRoom = async () => {
    for (const e of ws.activeEdits) if (e.kind !== "remove") await ws.toggle(e.id, false);
    if (!hasRemoveAll) await ws.addEdit({ kind: "remove" });
    if (await ws.generate()) onDone();
  };

  // ── header (only goal + builder now) ──
  const totalSteps = 2;
  const shownTotal = totalSteps - minStep + 1;
  const shownCurrent = step - minStep + 1;
  const header = (
    <div className="space-y-2 mb-5">
      <div className="flex items-center justify-between">
        <button type="button"
          onClick={() => step > minStep ? setStep(step - 1) : onCancel?.()}
          className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">
          {step > minStep ? "← Back" : onCancel ? "← Back to result" : " "}
        </button>
        {shownTotal > 1 && <span className="text-[11px] text-[var(--muted-foreground)]">Step {shownCurrent} of {shownTotal}</span>}
      </div>
      {shownTotal > 1 && (
        <div className="flex gap-1">
          {Array.from({ length: shownTotal }, (_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < shownCurrent ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </div>
      )}
    </div>
  );

  const baseImg = baseImageUrl ?? restyle.original_url;
  const roomPanel = (
    <div className="w-full lg:w-[44%] lg:shrink-0 lg:sticky lg:top-4 space-y-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={baseImg} alt="Your room"
        className="w-full max-h-[40vh] lg:max-h-[78vh] object-contain rounded-2xl border border-[var(--border)] bg-[var(--muted)]" />
      <p className="text-[11px] text-[var(--muted-foreground)] text-center">
        {baseImg === restyle.original_url ? "Your original room — what you’re changing" : "Your room — what you’re changing"}
      </p>
    </div>
  );

  // ── the inline source UI (link / photo / describe) for the composer's current item ──
  const sourcePanel = current && (
    <div className="space-y-3">
      <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
        {(["link", "photo", "describe"] as const).map(m => (
          <button key={m} type="button" onClick={() => setSrcMode(m)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              srcMode === m ? "bg-white shadow-sm text-slate-800" : "text-[var(--muted-foreground)] hover:text-slate-700"
            }`}>
            {m === "link" ? "Paste a link" : m === "photo" ? "Upload a photo" : "Describe it"}
          </button>
        ))}
      </div>

      {srcMode === "link" && (
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-[11px] text-[var(--muted-foreground)]">Preferred — paste a Wayfair, Amazon, Walmart or Home Depot product link.</p>
          <div className="flex gap-2">
            <input type="url" value={ws.productUrl} onChange={e => ws.setProductUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && ws.productUrl.trim()) ws.fetchProductLink(); }}
              placeholder="https://www.wayfair.com/…" className={inp} />
            <button type="button" disabled={ws.fetchingProduct || !ws.productUrl.trim()} onClick={() => ws.fetchProductLink()}
              className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">
              {ws.fetchingProduct ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin inline-block" /> : "Fetch"}
            </button>
          </div>
          <button type="button" onClick={() => setSrcMode("photo")}
            className="text-[11px] text-[var(--muted-foreground)] underline hover:text-slate-700 transition-colors">
            Can&apos;t find a link? Upload a photo instead →
          </button>
        </div>
      )}

      {srcMode === "photo" && (
        <div className={`${card} p-4 space-y-2.5`}
          onPaste={(e) => { const f = Array.from(e.clipboardData.files).find(f => f.type.startsWith("image/")); if (f) pickPending(f); }}>
          <p className="text-[11px] text-[var(--muted-foreground)]">Upload a photo or screenshot of the product (or just inspiration). You&apos;ll confirm before we place it and search for matches.</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) pickPending(f); e.target.value = ""; }} />

          {pendingFile && !ws.fetchingProduct ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreview ?? ""} alt="Selected" className="w-full max-h-44 object-contain rounded-lg border border-[var(--border)] bg-[var(--muted)]" />
              <p className="text-[11px] text-[var(--muted-foreground)]">Use this photo? We&apos;ll place it in your room and look for matches to buy.</p>
              <div className="flex gap-2">
                <button type="button" onClick={confirmPending}
                  className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] font-medium py-2 rounded-lg text-xs hover:opacity-90 transition-opacity">
                  Use this photo
                </button>
                <button type="button" onClick={() => { clearPending(); fileRef.current?.click(); }}
                  className="px-3 border border-[var(--border)] rounded-lg text-xs text-slate-600 hover:border-slate-400 transition-colors">
                  Choose different
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={ws.searching || ws.fetchingProduct} onClick={() => fileRef.current?.click()}
              className="w-full border border-dashed border-[var(--border)] rounded-lg py-3 text-xs text-[var(--muted-foreground)] hover:border-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {ws.fetchingProduct
                ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" /> Placing it in your room…</>
                : ws.searchFile ? "Choose a different photo" : "Choose or paste a photo"}
            </button>
          )}

          {!pendingFile && ws.searchFile && !ws.fetchingProduct && (
            <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
              ✓ Your photo is placed. {ws.searching ? "Finding options to buy…" : "Pick a match below to buy it, or keep your photo."}
            </p>
          )}
          {!pendingFile && ws.searching && (
            <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin inline-block" /> Finding the best matches…
            </p>
          )}
          {!pendingFile && ws.searchError && <p className="text-xs text-red-600">{ws.searchError}</p>}
          {!pendingFile && ws.searchFile && !ws.searching && displayCandidates && displayCandidates.length === 0 && (
            <p className="text-xs text-[var(--muted-foreground)]">Couldn&apos;t find a match to buy — we&apos;ll use your photo.</p>
          )}
          {!pendingFile && <CandidateList candidates={displayCandidates} ws={ws} />}
        </div>
      )}

      {srcMode === "describe" && (
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-[11px] text-[var(--muted-foreground)]">No link or photo? Describe it — color, material, style, and where it goes.</p>
          <input type="text" value={descText} onChange={e => setDescText(e.target.value)}
            placeholder={`e.g. a low walnut ${current.label} with brass legs`} className={inp} />
          <button type="button" disabled={ws.busy || !descText.trim()}
            onClick={() => ws.addEdit({ kind: current.mode === "swap" ? "item" : "add", targetLabel: current.label, instruction: descText.trim() })}
            className={stageBtn}>
            Add to plan
          </button>
        </div>
      )}

      {currentStaged && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs px-3 py-2">
          ✓ {current.mode === "swap" ? "Swapping" : "Adding"} <span className="capitalize">{current.label}</span>
          {ws.lastProduct?.title ? <span className="text-emerald-700"> → {ws.lastProduct.title}</span> : null}
        </div>
      )}
      {ws.error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2">{ws.error}</div>}

      <div className="flex gap-2">
        <button type="button" onClick={nextChange}
          className="flex-1 text-sm py-2.5 rounded-xl border border-[var(--border)] text-slate-600 hover:border-slate-400 transition-colors">
          {currentStaged ? "Add another change" : "Cancel"}
        </button>
        <button type="button" onClick={closeComposer}
          className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] font-medium py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity">
          Done
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:items-start max-w-5xl mx-auto">
      {roomPanel}

      <div className="w-full lg:flex-1 min-w-0">
      {header}

      {/* ── Step 1 — Goal ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">What do you want to do with this room?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">Pick one — you can fine-tune everything later.</p>
          </div>
          <div className="space-y-2">
            {MODES.map(m => {
              const on = mode === m.key;
              return (
                <button key={m.key} type="button" onClick={() => setMode(m.key)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    on ? "border-slate-900 bg-[var(--accent)]" : "border-[var(--border)] hover:border-slate-400"
                  }`}>
                  <span className="text-xl">{m.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{m.title}</span>
                    <span className="block text-xs text-[var(--muted-foreground)]">{m.desc}</span>
                  </span>
                  <span className={`h-4 w-4 rounded-full border-2 shrink-0 ${on ? "bg-slate-900 border-slate-900" : "border-slate-300"}`} />
                </button>
              );
            })}
          </div>
          <button type="button" disabled={!mode} onClick={() => setStep(2)}
            className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold py-3 rounded-xl text-sm hover:opacity-90 disabled:opacity-30 transition-opacity">
            Continue
          </button>
        </div>
      )}

      {/* ── Builder (restyle) — one screen ── */}
      {step === 2 && mode === "restyle" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">What do you want to change?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">Add as many swaps and new pieces as you like, then generate once.</p>
          </div>

          {/* Staged changes */}
          {stagedItems.length > 0 && (
            <div className="space-y-2">
              {stagedItems.map(e => (
                <div key={e.id} className={`${card} p-2.5 flex items-center gap-3`}>
                  {e.reference_url
                    ? /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={e.reference_url} alt="" className="h-12 w-12 rounded-lg object-cover border border-[var(--border)] shrink-0" />
                    : <span className="h-12 w-12 rounded-lg bg-slate-100 border border-[var(--border)] shrink-0 flex items-center justify-center text-sm">{e.kind === "add" ? "➕" : "🔁"}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 truncate capitalize">{e.product_title ?? e.target_label}</p>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                      <span className="capitalize">{e.kind === "add" ? "Added" : "Swapped"}{e.target_label ? ` · ${e.target_label}` : ""}</span>
                      {e.product_price && <span className="font-medium text-slate-600">{e.product_price}</span>}
                    </div>
                    {e.buy_url && (
                      <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-slate-700 underline hover:text-slate-900">
                        View on {storeName(e.buy_url)} ↗
                      </a>
                    )}
                  </div>
                  <button type="button" disabled={ws.busy} onClick={() => ws.remove(e.id)}
                    className="text-slate-300 hover:text-red-500 text-base shrink-0 px-1">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Composer */}
          {!composing ? (
            <button type="button" onClick={() => { setComposing(true); setCurrent(null); resetSourcing(); }}
              className="w-full border border-dashed border-[var(--border)] rounded-xl py-3 text-sm text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors">
              + Add a change
            </button>
          ) : !current ? (
            <div className={`${card} p-4 space-y-3`}>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-800">🔁 Swap an item</p>
                  <div className="flex flex-wrap gap-1.5">
                    {objects.map(label => (
                      <button key={label} type="button" onClick={() => chooseItem(label, "swap")} className={chip(false)}>{label}</button>
                    ))}
                    {(restyle.custom_items ?? []).map(label => (
                      <button key={label} type="button" onClick={() => chooseItem(label, "swap")}
                        className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-600 hover:border-slate-400 capitalize transition-colors">{label}</button>
                    ))}
                    {!showMissing ? (
                      <button type="button" onClick={() => setShowMissing(true)}
                        className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">+ Add item</button>
                    ) : (
                      <div className="flex gap-1.5 w-full">
                        <input type="text" value={missingDraft} autoFocus onChange={e => setMissingDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addMissingItem(missingDraft); if (e.key === "Escape") { setShowMissing(false); setMissingDraft(""); } }}
                          placeholder="name an item we missed — e.g. floor lamp" className={inp} />
                        <button type="button" disabled={ws.busy || !missingDraft.trim()} onClick={() => addMissingItem(missingDraft)}
                          className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">Add</button>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-amber-600">Missing one? Add it — if our detector missed it the swap may not land perfectly.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-800">➕ Add new</p>
                  <div className="flex gap-1.5">
                    <input type="text" value={addLabelDraft} onChange={e => setAddLabelDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") chooseItem(addLabelDraft, "add"); }}
                      placeholder="e.g. area rug" className={inp} />
                    <button type="button" disabled={!addLabelDraft.trim()} onClick={() => chooseItem(addLabelDraft, "add")}
                      className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">Next</button>
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeComposer}
                className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">Cancel</button>
            </div>
          ) : (
            <div className={`${card} p-4 space-y-3`}>
              <p className="text-sm font-medium text-slate-800 capitalize">
                {current.mode === "swap" ? "Swap the " : "Add "}{current.label}
              </p>
              {sourcePanel}
            </div>
          )}

          <button type="button" disabled={activeEdits.length === 0 || ws.generating || ws.busy} onClick={onGenerate}
            className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold py-3 rounded-xl text-sm hover:opacity-90 disabled:opacity-30 transition-opacity flex items-center justify-center gap-2 sticky bottom-4 shadow-lg shadow-slate-900/10">
            {ws.generating
              ? <><span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Generating…</>
              : <>Generate{activeEdits.length > 0 && <span className="ml-1 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeEdits.length}</span>}</>}
          </button>
        </div>
      )}

      {/* ── Empty confirm ── */}
      {step === 2 && mode === "empty" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Empty this room?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-0.5">We&apos;ll clear out the furniture and render the bare space.</p>
          </div>
          <div className={`${card} p-4 text-sm text-slate-600 space-y-1.5`}>
            <p>🧹 Furniture and decor get removed — walls, floors, windows and built-ins stay put.</p>
            <p className="text-[var(--muted-foreground)]">Want to stage it? Once it&apos;s empty, come back and <span className="font-medium text-slate-700">add pieces</span> from the result.</p>
          </div>
          {ws.error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2">{ws.error}</div>}
          <button type="button" onClick={onEmptyRoom} disabled={ws.generating || ws.busy}
            className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold py-3 rounded-xl text-sm hover:opacity-90 disabled:opacity-30 transition-opacity flex items-center justify-center gap-2">
            {ws.generating
              ? <><span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Emptying the room…</>
              : "Empty the room →"}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

/** Shoppable matches for the item being sourced — match word, price, View on, alternates. */
function CandidateList({ candidates, ws }: { candidates: ShoppingResult[] | null; ws: RestyleWorkspace }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div className="space-y-2 pt-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Options online — pick one, or keep your photo</p>
      {candidates.map((c, i) => {
        const word = matchWord(c.score, c.exact);
        const viewUrl = c.productUrl ?? c.alternates?.[0]?.url ?? null;
        return (
          <div key={i} className={`flex gap-2 p-2 rounded-lg border ${c.supported ? "border-[var(--border)] bg-white" : "border-[var(--border)] bg-slate-50"}`}>
            {c.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.thumbnail} alt="" className="h-14 w-14 object-cover rounded shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <span className={`inline-block text-[9px] px-1 py-0.5 rounded font-medium ${word.cls}`}>{word.label}</span>
              <p className="text-[11px] font-medium text-slate-800 line-clamp-2 leading-tight">{c.title}</p>
              <div className="flex items-center gap-1.5">
                {c.price && <span className="text-[10px] font-semibold text-slate-700">{c.price}</span>}
                <span className="text-[10px] text-[var(--muted-foreground)]">{c.retailer}</span>
              </div>
              {c.alternates && c.alternates.length > 0 && (
                <p className="text-[10px] text-[var(--muted-foreground)] leading-tight">
                  also at{c.alternates.map((a, j) => (
                    <span key={j}>{j > 0 ? " · " : " "}
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">
                        {a.retailer}{a.price ? ` ${a.price}` : ""}
                      </a>
                    </span>
                  ))}
                </p>
              )}
              <div className="flex items-center gap-2 pt-0.5">
                <button type="button" disabled={!c.supported || ws.fetchingProduct} onClick={() => ws.pickCandidate(c)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    c.supported ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] hover:opacity-90" : "border-[var(--border)] text-[var(--muted-foreground)] cursor-not-allowed"
                  }`}>
                  {c.supported ? "Use this" : "Not shoppable yet"}
                </button>
                {viewUrl && (
                  <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-slate-600 underline hover:text-slate-900">
                    View on {storeName(viewUrl)} ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
