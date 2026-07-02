"use client";

import { useState, useRef, useEffect } from "react";
import { Sofa, Eraser, Replace, Plus, X, Check, ExternalLink, ChevronRight, type LucideIcon } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { downscaleImage } from "@/lib/image-client";
import { card, inp, chip } from "./shared";
import { Button, ProductCard, matchWord, storeName } from "./ui";

// Two mutually-exclusive intents. "Empty" clears everything and renders in one shot.
// "Restyle" is a one-screen builder: stage as many swap/add changes as you like, then Generate.
type Mode = "restyle" | "empty";
type SrcMode = "link" | "photo" | "describe";

const MODES: { key: Mode; title: string; desc: string; Icon: LucideIcon }[] = [
  { key: "restyle", title: "Restyle the room", desc: "Swap things out or add new pieces", Icon: Sofa },
  { key: "empty", title: "Empty the room", desc: "Remove all the furniture for a blank space", Icon: Eraser },
];

export default function RestyleWizard({
  ws, startStep = 1, minStep = 1, initialMode = null, initialItem = null, baseImageUrl, onDone, onCancel,
}: {
  ws: RestyleWorkspace;
  startStep?: number;
  minStep?: number;
  initialMode?: Mode | null;
  initialItem?: { label: string; mode: "swap" | "add" } | null; // open sourcing straight for this item
  baseImageUrl?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(startStep);
  const [mode, setMode] = useState<Mode | null>(initialMode);

  // Builder composer — when replacing one product, open its sourcing screen immediately.
  const [composing, setComposing] = useState(!!initialItem);
  const [pickMode, setPickMode] = useState<"swap" | null>(null); // choice → swap screen ("add" skips straight to sourcing)
  const [current, setCurrent] = useState<{ label: string; mode: "swap" | "add" } | null>(initialItem);
  const [srcMode, setSrcMode] = useState<SrcMode>("link");
  const [descText, setDescText] = useState("");
  const [missingDraft, setMissingDraft] = useState("");
  const [showMissing, setShowMissing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Found matches cached per item label so revisiting doesn't re-search (saves credits).
  const [candidatesByLabel, setCandidatesByLabel] = useState<Record<string, ShoppingResult[]>>({});

  // Tracks which specific candidate is mid-pick — some retailers (Wayfair via Unwrangle) can
  // take up to ~90s to fetch full listing detail, and with no per-item feedback that looked
  // like the app had frozen. Key is arbitrary as long as it's unique per rendered candidate.
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const pickWithFeedback = async (c: ShoppingResult, targetLabel: string | undefined, key: string) => {
    setPickingKey(key);
    try { await ws.pickCandidate(c, targetLabel); } finally { setPickingKey(null); }
  };

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

  // Fill in the label once the AI identifies an "add" item from its photo/link — keeps the
  // header text, staged-item lookups, and further searches all pointed at the real label.
  useEffect(() => {
    const detected = ws.lastProduct?.targetLabel;
    if (!detected || !current || current.label) return;
    let active = true;
    Promise.resolve().then(() => { if (active) setCurrent(c => (c && !c.label ? { ...c, label: detected } : c)); });
    return () => { active = false; };
  }, [ws.lastProduct?.targetLabel, current]);

  // Mirror live search results into the per-label cache. "Add" items start sourcing with
  // no label (the AI detects it from the photo/link) — once staged, the backend's detected
  // target_label is the real key the staged-item panel reads by, so prefer that over the
  // empty current.label; otherwise results would cache under "" and never surface again.
  useEffect(() => {
    const lbl = (ws.lastProduct?.targetLabel || current?.label)?.toLowerCase();
    const caps = ws.candidates;
    if (!lbl || !caps || !caps.length) return;
    let active = true;
    Promise.resolve().then(() => { if (active) setCandidatesByLabel(prev => ({ ...prev, [lbl]: caps })); });
    return () => { active = false; };
  }, [ws.candidates, current?.label, ws.lastProduct?.targetLabel]);

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

  // Open the composer for an item. We do NOT search here — options are only looked
  // up once the user actually pastes a link or uploads a reference photo. "Add" can
  // start with no label (empty) and let the AI identify the piece from the photo/link.
  const chooseItem = (label: string, m: "swap" | "add") => {
    const l = label.trim();
    if (m === "swap" && !l) return;
    resetSourcing();
    setCurrent({ label: l, mode: m });
    setShowMissing(false); setMissingDraft("");
    const cached = l ? candidatesByLabel[l.toLowerCase()] : null;
    if (cached?.length) ws.setCandidates(cached); // show previously-found options, but don't re-search
  };
  const addMissingItem = async (label: string) => {
    const l = label.trim(); if (!l) return;
    setShowMissing(false); setMissingDraft("");
    await ws.addCustomItem(l);
    chooseItem(l, "swap");
  };
  // Compose another after one is staged → back to the swap/add choice.
  const nextChange = () => { setCurrent(null); setPickMode(null); resetSourcing(); };
  const closeComposer = () => { setComposing(false); setCurrent(null); setPickMode(null); resetSourcing(); };

  const uploadInspo = async (file: File) => {
    // Downscale client-side first — raw phone photos blow past Vercel's 4.5 MB
    // body limit and the upload dies as a bare "load failed".
    const small = await downscaleImage(file);
    await ws.uploadPhotoProduct(small);
    ws.runVisualSearch(small);
  };
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
        {(current.mode === "add" ? (["link", "photo"] as const) : (["link", "photo", "describe"] as const)).map(m => (
          <button key={m} type="button" onClick={() => setSrcMode(m)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              srcMode === m ? "bg-white shadow-sm text-slate-800" : "text-[var(--muted-foreground)] hover:text-slate-700"
            }`}>
            {m === "link" ? "Paste a link" : m === "photo" ? "Upload a photo" : "Describe it"}
          </button>
        ))}
      </div>

      {/* Candidates always visible regardless of active tab */}
      {ws.searching && (
        <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin inline-block" />
          Searching for {current.label || "matching"} options…
        </p>
      )}
      {ws.searchError && <p className="text-xs text-red-600">{ws.searchError}</p>}
      {!ws.searching && displayCandidates && displayCandidates.length > 0 && (
        <CandidateList candidates={displayCandidates} ws={ws} targetLabel={current.label}
          pickingKey={pickingKey} onPick={pickWithFeedback} />
      )}

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

          {!pendingFile && ws.searchFile && !ws.fetchingProduct && !ws.searching && (
            ws.lastProduct?.retailer ? (
              // A real product replaced the uploaded photo as the reference — make that
              // switch unmissable, since the room render now uses the product's own photo,
              // not the screenshot you uploaded.
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0" /> Switched to <strong>{ws.lastProduct.title}</strong> from {ws.lastProduct.retailer} — your uploaded photo is no longer used.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 shrink-0" /> Your photo is placed. {displayCandidates?.length ? "Pick a match below to buy it, or keep your photo." : "Couldn't find a buyable match — we'll use your photo."}
              </p>
            )
          )}
        </div>
      )}

      {srcMode === "describe" && (
        <div className={`${card} p-4 space-y-2.5`}>
          <p className="text-[11px] text-[var(--muted-foreground)]">No link or photo? Describe it — color, material, style. We&apos;ll find matching products to shop, or you can just go with your description.</p>
          <div className="flex gap-2">
            <input type="text" value={descText} onChange={e => setDescText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && descText.trim()) ws.runTextSearch(descText); }}
              placeholder={`e.g. a low walnut ${current.label} with brass legs`} className={inp} />
            <button type="button" disabled={ws.searching || !descText.trim()} onClick={() => ws.runTextSearch(descText)}
              className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0 flex items-center gap-1.5">
              {ws.searching ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : "Find"}
            </button>
          </div>
          <button type="button" disabled={ws.busy || !descText.trim()}
            onClick={() => ws.addEdit({ kind: current.mode === "swap" ? "item" : "add", targetLabel: current.label, instruction: descText.trim() })}
            className="w-full text-xs py-2 rounded-lg border border-[var(--border)] text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors disabled:opacity-40">
            Just go with my description
          </button>
        </div>
      )}

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
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${
                    on ? "border-slate-900 bg-[var(--accent)]" : "border-[var(--border)] hover:border-slate-400"
                  }`}>
                  <m.Icon className="h-5 w-5 text-slate-700 shrink-0" />
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
              {stagedItems.map(e => {
                const isOpen = expandedId === e.id;
                const label = e.target_label ?? "";
                const savedCandidates = candidatesByLabel[label.toLowerCase()] ?? [];
                // Separate current product from other options. Wayfair listings sourced via
                // the keyword-fallback (Google Shopping) engine only carry an immersiveToken —
                // not a direct productUrl — until resolved at pick-time, so requiring
                // productUrl here would silently drop every supported Wayfair option.
                const otherCandidates = savedCandidates.filter(c =>
                  (c.productUrl || c.immersiveToken) && c.productUrl !== e.buy_url
                );
                const hasProduct = !!(e.buy_url || e.product_title);
                const hasOptions = otherCandidates.length > 0;

                return (
                  <div key={e.id} className="border border-[var(--border)] bg-white overflow-hidden">
                    {/* Collapsed row — always visible */}
                    <button type="button" onClick={() => setExpandedId(isOpen ? null : e.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--muted)] transition-colors">
                      {e.reference_url
                        ? /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={e.reference_url} alt="" className="h-14 w-14 object-cover border border-[var(--border)] shrink-0" />
                        : <span className="h-14 w-14 bg-[var(--muted)] border border-[var(--border)] shrink-0 flex items-center justify-center text-slate-400">{e.kind === "add" ? <Plus className="h-5 w-5" /> : <Replace className="h-5 w-5" />}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate capitalize tracking-tight">
                          {e.product_title ?? label}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] capitalize mt-0.5">
                          {e.kind === "add" ? "Adding" : "Swapping"}{label ? ` · ${label}` : ""}
                          {e.product_price ? ` · ${e.product_price}` : ""}
                        </p>
                        {/* Clear affordance */}
                        <p className="text-[11px] text-[var(--primary)] font-medium mt-1">
                          {isOpen ? "Hide details ↑" : `View details${hasOptions ? ` · ${otherCandidates.length + (hasProduct ? 1 : 0)} option${otherCandidates.length + (hasProduct ? 1 : 0) !== 1 ? "s" : ""} saved` : ""} ↓`}
                        </p>
                      </div>
                    </button>

                    {/* Expanded panel */}
                    {isOpen && (
                      <div className="border-t border-[var(--border)] bg-[var(--muted)]">

                        {/* ── Currently selected product ── */}
                        <div className="p-3 space-y-2">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                            Currently selected
                          </p>
                          {hasProduct ? (
                            <ProductCard
                              image={e.reference_url}
                              title={e.product_title ?? label}
                              retailer={e.buy_url ? storeName(e.buy_url) : undefined}
                              price={e.product_price}
                              viewUrl={e.buy_url}
                              badge={{ label: "✓ In use", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" }}
                            />
                          ) : (
                            <div className="flex gap-3 p-3 border border-amber-200 bg-amber-50">
                              {e.reference_url
                                ? /* eslint-disable-next-line @next/next/no-img-element */
                                  <img src={e.reference_url} alt="" className="h-14 w-14 object-cover border border-amber-200 shrink-0" />
                                : null}
                              <div className="min-w-0 flex-1 space-y-1">
                                <p className="text-xs font-medium text-amber-800 capitalize">{label}</p>
                                <p className="text-xs text-amber-700">No product link found — we&apos;ll use your uploaded photo to render this item, but there&apos;s no buy link. Pick an option below or search for one.</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ── Other options saved from search ── */}
                        {hasOptions && (
                          <div className="px-3 pb-3 space-y-2">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                              Other options found ({otherCandidates.length})
                            </p>
                            {otherCandidates.map((c, i) => {
                              const key = `${e.id}:${i}`;
                              const picking = pickingKey === key;
                              return (
                                <ProductCard key={i}
                                  image={c.thumbnail}
                                  title={c.title}
                                  retailer={c.retailer}
                                  price={c.price}
                                  viewUrl={c.productUrl ?? null}
                                  badge={matchWord(c.score, c.exact)}>
                                  <Button size="sm" variant={c.supported ? "outline" : "ghost"}
                                    disabled={!c.supported || ws.fetchingProduct}
                                    onClick={() => pickWithFeedback(c, label, key)}
                                    className="mt-1">
                                    {picking
                                      ? <><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />Adding…</>
                                      : c.supported ? "Use this instead" : "Not shoppable"}
                                  </Button>
                                  {picking && (
                                    <p className="text-[11px] text-[var(--muted-foreground)]">Fetching live price and details — can take up to a minute for some retailers.</p>
                                  )}
                                </ProductCard>
                              );
                            })}
                          </div>
                        )}

                        {/* ── No options at all ── */}
                        {!hasOptions && !hasProduct && (
                          <div className="px-3 pb-3">
                            {ws.searching && current?.label?.toLowerCase() === label.toLowerCase() ? (
                              <p className="text-xs text-[var(--muted-foreground)] bg-white border border-[var(--border)] px-3 py-2 flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin inline-block shrink-0" />
                                Still searching for matches…
                              </p>
                            ) : (
                            <p className="text-xs text-[var(--muted-foreground)] bg-white border border-[var(--border)] px-3 py-2">
                              No product options were saved for this item. Search for one below.
                            </p>
                            )}
                          </div>
                        )}

                        {/* ── Actions ── */}
                        <div className="px-3 pb-3 flex gap-2 pt-1">
                          <button type="button"
                            onClick={() => { setExpandedId(null); setComposing(true); chooseItem(label, e.kind === "add" ? "add" : "swap"); }}
                            className="flex-1 text-xs py-2 border border-[var(--border)] bg-white text-slate-700 hover:border-slate-400 transition-colors font-medium">
                            Search for different options
                          </button>
                          <button type="button" disabled={ws.busy}
                            onClick={() => { setExpandedId(null); ws.remove(e.id); }}
                            className="px-3 text-xs py-2 border border-red-200 bg-white text-red-500 hover:border-red-400 hover:text-red-600 transition-colors">
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* "+ Add a change" only appears to add MORE once something is staged */}
          {!composing && stagedItems.length > 0 && (
            <button type="button" onClick={() => { setComposing(true); setCurrent(null); setPickMode(null); resetSourcing(); }}
              className="w-full border border-dashed border-[var(--border)] rounded-xl py-3 text-sm text-slate-600 hover:border-slate-400 hover:text-slate-800 transition-colors">
              + Add a change
            </button>
          )}

          {/* Composer — open straight away when nothing is staged */}
          {(composing || stagedItems.length === 0) && (
            current ? (
              // ── Source the chosen item ──
              <div className={`${card} p-4 space-y-3`}>
                <button type="button" onClick={() => { setCurrent(null); resetSourcing(); }}
                  className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">← Back</button>
                <p className="text-sm font-medium text-slate-800 capitalize">
                  {current.mode === "swap"
                    ? `Replacing the ${current.label}`
                    : current.label ? `Adding ${current.label}` : "Adding a new piece"}
                </p>
                {sourcePanel}
                {currentStaged && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs px-3 py-2 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0" /> {current.mode === "swap" ? "Swapping" : "Adding"} <span className="capitalize">{current.label || "your new piece"}</span>
                    {ws.lastProduct?.title ? <span className="text-emerald-700"> → {ws.lastProduct.title}</span> : null}
                  </div>
                )}
                {ws.error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2">{ws.error}</div>}
                {currentStaged && (
                  <div className="flex gap-2">
                    <button type="button" onClick={nextChange}
                      className="flex-1 text-sm py-2.5 rounded-xl border border-[var(--border)] text-slate-600 hover:border-slate-400 transition-colors">
                      Make another change
                    </button>
                    <button type="button" onClick={closeComposer}
                      className="flex-1 bg-[var(--primary)] text-[var(--primary-foreground)] font-medium py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity">
                      Done
                    </button>
                  </div>
                )}
              </div>
            ) : pickMode === null ? (
              // ── Choice: swap something here, or add something new ──
              <div className="space-y-2">
                <button type="button" onClick={() => setPickMode("swap")}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors border-[var(--border)] hover:border-slate-400`}>
                  <Replace className="h-5 w-5 text-slate-700 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">Swap something out</span>
                    <span className="block text-xs text-[var(--muted-foreground)]">Replace an item that&apos;s already in the room</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
                <button type="button" onClick={() => chooseItem("", "add")}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-colors border-[var(--border)] hover:border-slate-400`}>
                  <Plus className="h-5 w-5 text-slate-700 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">Add a new piece</span>
                    <span className="block text-xs text-[var(--muted-foreground)]">Paste a link or upload a photo — we&apos;ll figure out what it is</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
                {stagedItems.length > 0 && (
                  <button type="button" onClick={closeComposer}
                    className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors pt-1">Cancel</button>
                )}
              </div>
            ) : pickMode === "swap" ? (
              // ── Swap: pick which item ──
              <div className={`${card} p-4 space-y-2.5`}>
                <button type="button" onClick={() => { setPickMode(null); setShowMissing(false); setMissingDraft(""); }}
                  className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">← Back</button>
                <p className="text-sm font-medium text-slate-800">Which item are you swapping out?</p>
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
                      className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">+ Not listed?</button>
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
                {showMissing && <p className="text-[10px] text-amber-600">If our detector missed it, the swap may not land perfectly — a clear, specific name helps.</p>}
              </div>
            ) : null
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
            <p className="flex items-start gap-1.5"><Eraser className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" /> Furniture and decor get removed — walls, floors, windows and built-ins stay put.</p>
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
function CandidateList({ candidates, ws, targetLabel, pickingKey, onPick }: {
  candidates: ShoppingResult[] | null; ws: RestyleWorkspace; targetLabel?: string;
  pickingKey: string | null; onPick: (c: ShoppingResult, targetLabel: string | undefined, key: string) => void;
}) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div className="space-y-2 pt-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {targetLabel ? `Options for ${targetLabel} — pick one to use it` : "Options online — pick one, or keep yours"}
      </p>
      {candidates.map((c, i) => {
        const key = `live:${targetLabel ?? ""}:${i}`;
        const picking = pickingKey === key;
        return (
          <ProductCard key={i}
            image={c.thumbnail}
            title={c.title}
            retailer={c.retailer}
            price={c.price}
            viewUrl={c.productUrl ?? c.alternates?.[0]?.url ?? null}
            badge={matchWord(c.score, c.exact)}>
            {c.alternates && c.alternates.length > 0 && (
              <p className="text-[11px] text-[var(--muted-foreground)] leading-tight">
                also at{c.alternates.map((a, j) => (
                  <span key={j}>{j > 0 ? " · " : " "}
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">
                      {a.retailer}{a.price ? ` ${a.price}` : ""}
                    </a>
                  </span>
                ))}
              </p>
            )}
            <Button size="sm" variant={c.supported ? "primary" : "outline"}
              disabled={!c.supported || ws.fetchingProduct} onClick={() => onPick(c, targetLabel, key)} className="mt-1">
              {picking
                ? <><span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />Adding…</>
                : c.supported ? "Use this in the room" : "Not shoppable yet"}
            </Button>
            {picking && (
              <p className="text-[11px] text-[var(--muted-foreground)]">Fetching live price and details — can take up to a minute for some retailers.</p>
            )}
          </ProductCard>
        );
      })}
    </div>
  );
}
