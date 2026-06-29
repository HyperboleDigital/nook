"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import type { Restyle, RestyleEdit, RestyleRender } from "@/types";

const THEMES = [
  { label: "Modern", desc: "modern contemporary style" },
  { label: "Scandinavian", desc: "Scandinavian style — light woods, neutral tones, cozy minimalism" },
  { label: "Mid-Century", desc: "mid-century modern — warm woods, retro furniture, clean lines" },
  { label: "Industrial", desc: "industrial — exposed materials, metal, leather, moody tones" },
  { label: "Coastal", desc: "coastal — airy, light blues and whites, natural textures" },
  { label: "Japandi", desc: "Japandi — warm minimal, natural materials" },
  { label: "Minimalist", desc: "minimalist — uncluttered, neutral palette, clean forms" },
  { label: "Luxe", desc: "luxury — high-end finishes, rich materials, statement pieces" },
];

const ITEM_SUGGESTIONS: Record<string, string[]> = {
  seating: ["tan leather", "dark fabric", "lighter color", "sectional shape"],
  chair: ["different style", "leather", "lighter fabric", "matching the sofa"],
  console: ["low and wide floating", "darker wood tone", "light oak finish", "open shelving"],
  tv: ["larger screen", "wall-mounted, no stand", "sleeker thinner frame"],
  lamp: ["black metal finish", "brass finish", "taller and slimmer", "shorter with wide shade"],
  fixture: ["matte black", "brass/gold finish", "modern minimalist", "pendant replacement"],
  rug: ["solid neutral", "geometric pattern", "larger size", "lighter color"],
  curtains: ["linen sheer white", "blackout drapes", "floor-length neutral", "remove curtains"],
  bed: ["upholstered headboard", "wooden platform frame", "darker color", "lighter/white frame"],
  table: ["lower and wider", "round shape", "glass top", "marble top"],
  storage: ["dark stained", "white painted", "floating shelves", "taller unit"],
  cabinet: ["white painted", "dark navy", "natural wood tone", "open shelving"],
  "dining-table": ["round shape", "lighter wood", "darker stain", "marble top"],
  "dining-chair": ["upholstered seat", "metal legs", "matching set", "different style"],
  floor: ["lighter wood", "darker stained wood", "large format tile", "herringbone pattern"],
  wall: ["white painted", "dark accent wall", "exposed brick texture", "geometric wallpaper"],
};

function normalizeToCategory(label: string): string {
  const l = label.toLowerCase();
  if (/sofa|couch|sectional/.test(l)) return "seating";
  if (/dining chair/.test(l)) return "dining-chair";
  if (/dining table/.test(l)) return "dining-table";
  if (/chair|armchair/.test(l)) return "chair";
  if (/tv stand|media console|console/.test(l)) return "console";
  if (/\btv\b|television/.test(l)) return "tv";
  if (/\blamp\b|floor lamp|table lamp/.test(l)) return "lamp";
  if (/ceiling fan|chandelier|pendant|light fixture/.test(l)) return "fixture";
  if (/\brug\b|carpet/.test(l)) return "rug";
  if (/curtain|drape/.test(l)) return "curtains";
  if (/\bbed\b|headboard/.test(l)) return "bed";
  if (/coffee table|side table|end table|nightstand/.test(l)) return "table";
  if (/bookshelf|bookcase/.test(l)) return "storage";
  if (/cabinet|kitchen cabinet/.test(l)) return "cabinet";
  if (/\bfloor\b/.test(l)) return "floor";
  if (/\bwall\b/.test(l)) return "wall";
  return "";
}

function editSummary(e: RestyleEdit): string {
  switch (e.kind) {
    case "item": return `${e.target_label ?? "Item"} → ${e.reference_url ? "photo ref" : e.instruction ?? "changed"}`;
    case "style": return `Style: ${e.instruction ?? ""}`.slice(0, 40);
    case "remove": return "Remove all furniture";
    case "add": return `Add: ${e.target_label ?? "item"}`;
    default: return e.instruction ?? "Refinement";
  }
}

// ── Light-theme style helpers (match the app shell) ──
const card = "bg-[var(--card)] border border-[var(--border)] rounded-xl";
const inp = "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400";
const sectionLabel = "text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]";
const stageBtn = "w-full bg-[var(--primary)] text-[var(--primary-foreground)] py-2 rounded-lg text-xs font-medium disabled:opacity-30 hover:opacity-90 transition-opacity";
const ghostExpand = "text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:border-slate-400 hover:text-slate-700 transition-colors w-full text-left";

export default function RestyleWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [restyle, setRestyle] = useState<Restyle | null>(null);
  const [renders, setRenders] = useState<RestyleRender[]>([]);
  const [objects, setObjects] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");

  // Modify an item
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [reference, setReference] = useState<File | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const [showItemInput, setShowItemInput] = useState(false);
  const [newItemName, setNewItemName] = useState("");

  // Add to room
  const [addLabel, setAddLabel] = useState("");
  const [addPlacement, setAddPlacement] = useState("");
  const [addRef, setAddRef] = useState<File | null>(null);
  const addRefInputRef = useRef<HTMLInputElement>(null);

  // Add a product (shop the look)
  const [productUrl, setProductUrl] = useState("");
  const [fetchingProduct, setFetchingProduct] = useState(false);
  const [lastProduct, setLastProduct] = useState<{ editId: string; kind: "item" | "add"; targetLabel: string; retailer: string; title: string } | null>(null);

  // Room style
  const [showCustomStyle, setShowCustomStyle] = useState(false);
  const [customStyle, setCustomStyle] = useState("");
  const [showRefine, setShowRefine] = useState(false);
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

  // History preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/restyles/${id}`);
      if (!active || !res.ok) return;
      const d: Restyle = await res.json();
      setRestyle(d);
      setRenders(d.renders ?? []);
      setTitleDraft(d.title ?? "");

      if (d.detected_objects && d.detected_objects.length > 0) {
        setObjects(d.detected_objects.map((o) => o.label));
        return;
      }
      try {
        const dr = await fetch("/api/restyle/detect", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: d.original_url, restyleId: id }),
        });
        const dj = await dr.json();
        if (active) setObjects((dj.objects ?? []).map((o: { label: string }) => o.label));
      } catch {
        if (active) setObjects([]);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const saveTitle = async (t: string) => {
    const trimmed = t.trim();
    if (trimmed === (restyle?.title ?? "")) return;
    setRestyle(prev => prev ? { ...prev, title: trimmed || null } : prev);
    try {
      await fetch(`/api/restyles/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch { /* best effort */ }
  };

  const updateEdits = (edits: RestyleEdit[]) =>
    setRestyle(prev => prev ? { ...prev, edits } : prev);

  const addEdit = async (fields: Record<string, string>, refFile?: File | null) => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      if (refFile) fd.append("reference", refFile);
      const r = await fetch(`/api/restyle/${id}/edits`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      updateEdits(data.edits);
      setSelectedLabel(null); setInstruction(""); setReference(null);
      setCustomStyle(""); setShowCustomStyle(false);
      setRefineText(""); setShowRefine(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const addNewItem = async () => {
    if (!addLabel.trim()) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", "add"); fd.append("targetLabel", addLabel.trim());
      if (addPlacement.trim()) fd.append("instruction", addPlacement.trim());
      if (addRef) fd.append("reference", addRef);
      const r = await fetch(`/api/restyle/${id}/edits`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      updateEdits(data.edits);
      setAddLabel(""); setAddPlacement(""); setAddRef(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const fetchProductLink = async () => {
    const url = productUrl.trim();
    if (!url) return;
    setFetchingProduct(true); setError(null);
    try {
      const r = await fetch(`/api/restyle/${id}/product`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't fetch that product");
      updateEdits(data.edits);
      const a = data.added;
      const added = (data.edits as RestyleEdit[]).find(e => e.id === a.id);
      setLastProduct({ editId: a.id, kind: a.kind, targetLabel: a.target_label, retailer: a.retailer, title: added?.product_title ?? a.target_label });
      setProductUrl("");
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't fetch that product"); }
    finally { setFetchingProduct(false); }
  };

  const switchProductMode = async () => {
    if (!lastProduct) return;
    const newKind = lastProduct.kind === "item" ? "add" : "item";
    updateEdits((restyle?.edits ?? []).map(e => e.id === lastProduct.editId ? { ...e, kind: newKind } : e));
    setLastProduct({ ...lastProduct, kind: newKind });
    try {
      await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId: lastProduct.editId, kind: newKind }),
      });
    } catch { /* best effort — optimistic already set */ }
  };

  const generate = async () => {
    setGenerating(true); setError(null); setPreviewUrl(null);
    try {
      const r = await fetch(`/api/restyle/${id}/generate`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Generate failed");
      setRestyle(prev => prev ? { ...prev, current_url: data.url, edits: data.edits } : prev);
      if (data.renders) setRenders(data.renders);
    } catch (err) { setError(err instanceof Error ? err.message : "Generate failed"); }
    finally { setGenerating(false); }
  };

  const toggle = async (editId: string, active: boolean) => {
    updateEdits((restyle?.edits ?? []).map(e => e.id === editId ? { ...e, active } : e));
    try {
      await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId, active }),
      });
    } catch { /* best effort — optimistic is already set */ }
  };

  const selectOption = async (targetLabel: string, editId: string | null) => {
    const updated = (restyle?.edits ?? []).map(e =>
      e.kind === "item" && e.target_label === targetLabel ? { ...e, active: e.id === editId } : e
    );
    updateEdits(updated);
    const states = Object.fromEntries(
      updated.filter(e => e.kind === "item" && e.target_label === targetLabel).map(e => [e.id, e.active])
    );
    try {
      await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ states }),
      });
    } catch { /* best effort */ }
  };

  const remove = async (editId: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/restyle/${id}/edits?editId=${editId}`, { method: "DELETE" });
      const data = await r.json();
      if (r.ok) updateEdits(data.edits);
    } catch { /* best effort */ }
    finally { setBusy(false); }
  };

  const addCustomItem = async (label: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/restyle/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      setRestyle(prev => prev ? { ...prev, custom_items: data.custom_items } : prev);
      setSelectedLabel(label); setInstruction(""); setReference(null);
      setNewItemName(""); setShowItemInput(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
  };

  const removeCustomItem = async (label: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/restyle/${id}/items?label=${encodeURIComponent(label)}`, { method: "DELETE" });
      const data = await r.json();
      if (r.ok) {
        setRestyle(prev => prev ? { ...prev, custom_items: data.custom_items, edits: data.edits } : prev);
        if (selectedLabel === label) setSelectedLabel(null);
      }
    } catch { /* best effort */ }
    finally { setBusy(false); }
  };

  const downloadImage = async () => {
    const url = previewUrl ?? restyle?.current_url;
    if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: blobUrl, download: `restyle-${id}.png` });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch { window.open(url, "_blank"); }
  };

  if (!restyle || objects === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-[var(--muted-foreground)]">
          <span className="h-7 w-7 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin inline-block" />
          <span className="text-sm">Setting up your room…</span>
        </div>
      </div>
    );
  }

  const edits = restyle.edits ?? [];
  const activeEdits = edits.filter(e => e.active);
  const displayUrl = previewUrl ?? restyle.current_url;
  const showSlider = !previewUrl && displayUrl !== restyle.original_url;
  const canGenerate = activeEdits.length > 0;
  const atMaxCustom = (restyle.custom_items?.length ?? 0) >= 5;
  const suggestions = selectedLabel ? (ITEM_SUGGESTIONS[normalizeToCategory(selectedLabel)] ?? []) : [];

  const itemGroups = new Map<string, RestyleEdit[]>();
  const standalone: RestyleEdit[] = [];
  for (const e of edits) {
    if (e.kind === "item" && e.target_label) {
      const arr = itemGroups.get(e.target_label) ?? []; arr.push(e);
      itemGroups.set(e.target_label, arr);
    } else standalone.push(e);
  }
  const productEdits = edits.filter(e => e.buy_url);

  const chip = (active: boolean) =>
    `text-xs px-2.5 py-1 rounded-full border transition-colors capitalize ${
      active
        ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] font-medium"
        : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-slate-400 hover:text-slate-700"
    }`;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <Link href="/restyle" className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">
            ← All restyles
          </Link>
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={() => saveTitle(titleDraft)}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Untitled Room"
            className="block w-full bg-transparent text-xl font-bold tracking-tight focus:outline-none focus:underline placeholder:text-slate-300 mt-0.5"
          />
        </div>
      </div>

      {/* Workspace — image first on mobile, controls left on desktop */}
      <div className="flex flex-col-reverse lg:flex-row gap-6 lg:items-start">

        {/* ── Controls ── */}
        <div className="w-full lg:w-80 lg:shrink-0 space-y-4">

          {/* Add a product (shop the look) */}
          <div className={`${card} p-4 space-y-2.5`}>
            <p className={sectionLabel}>Add a product</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">Paste a Wayfair product link to try it in this room</p>
            <div className="flex gap-2">
              <input type="url" value={productUrl} onChange={e => setProductUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && productUrl.trim()) fetchProductLink(); }}
                placeholder="https://www.wayfair.com/…" className={inp} />
              <button type="button" disabled={fetchingProduct || !productUrl.trim()} onClick={fetchProductLink}
                className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0 flex items-center gap-1.5">
                {fetchingProduct
                  ? <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  : "Fetch"}
              </button>
            </div>
            {lastProduct && (
              <div className="rounded-lg border border-[var(--border)] bg-white p-2.5 text-xs space-y-1">
                <p className="font-medium text-slate-800 line-clamp-2">{lastProduct.title}</p>
                <p className="text-[var(--muted-foreground)]">
                  {lastProduct.kind === "item"
                    ? <>Will replace your <span className="capitalize">{lastProduct.targetLabel}</span></>
                    : <>Will be added to the room</>}
                  {" · "}
                  <button type="button" onClick={switchProductMode} className="underline hover:text-slate-900">
                    {lastProduct.kind === "item" ? "add as new instead" : <>replace <span className="capitalize">{lastProduct.targetLabel}</span> instead</>}
                  </button>
                </p>
                <p className="text-slate-400">Staged — hit Generate when ready.</p>
              </div>
            )}
          </div>

          {/* Modify an item */}
          <div className={`${card} p-4 space-y-3`}>
            <p className={sectionLabel}>Modify an item</p>

            {objects.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">No items detected.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 items-center">
                {objects.map(label => (
                  <button key={label} type="button"
                    onClick={() => { setSelectedLabel(label); setInstruction(""); setReference(null); setShowItemInput(false); }}
                    className={chip(selectedLabel === label)}>
                    {label}
                  </button>
                ))}
                {(restyle.custom_items ?? []).map(label => (
                  <span key={label}
                    className={`inline-flex items-center gap-0.5 text-xs pl-2.5 pr-1.5 py-1 rounded-full border transition-colors capitalize ${
                      selectedLabel === label
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)] font-medium"
                        : "border-dashed border-slate-300 text-[var(--muted-foreground)] hover:border-slate-400"
                    }`}>
                    <button type="button"
                      onClick={() => { setSelectedLabel(label); setInstruction(""); setReference(null); setShowItemInput(false); }}>
                      {label}
                    </button>
                    <button type="button" disabled={busy} onClick={() => removeCustomItem(label)}
                      className={`ml-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center text-[10px] leading-none ${selectedLabel === label ? "hover:bg-white/20" : "hover:bg-slate-200"}`}>
                      ×
                    </button>
                  </span>
                ))}
                {!atMaxCustom && !showItemInput && (
                  <button type="button"
                    onClick={() => { setShowItemInput(true); setSelectedLabel(null); }}
                    className="text-xs px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">
                    + Not listed?
                  </button>
                )}
              </div>
            )}

            {showItemInput && (
              <div className="flex gap-2">
                <input type="text" value={newItemName} autoFocus
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newItemName.trim()) addCustomItem(newItemName.trim());
                    if (e.key === "Escape") { setShowItemInput(false); setNewItemName(""); }
                  }}
                  placeholder="e.g. bookshelf"
                  className={inp} />
                <button type="button" disabled={!newItemName.trim()} onClick={() => addCustomItem(newItemName.trim())}
                  className="bg-[var(--primary)] text-[var(--primary-foreground)] px-3 rounded-lg text-xs font-medium disabled:opacity-40 shrink-0">
                  Add
                </button>
                <button type="button" onClick={() => { setShowItemInput(false); setNewItemName(""); }}
                  className="text-slate-400 hover:text-slate-600 text-sm shrink-0">✕</button>
              </div>
            )}

            {selectedLabel && (
              <div className="space-y-2.5 pt-1 border-t border-[var(--border)]">
                <p className="text-[11px] text-[var(--muted-foreground)] pt-2 capitalize">
                  {selectedLabel}
                  {!objects.includes(selectedLabel) && (
                    <span className="text-amber-600"> · will be added if not found</span>
                  )}
                </p>
                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium">Try:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map(s => (
                        <button key={s} type="button" onClick={() => setInstruction(s)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            instruction === s
                              ? "bg-slate-900 text-white border-slate-900"
                              : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-slate-400"
                          }`}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input type="text" value={instruction} onChange={e => setInstruction(e.target.value)}
                  placeholder={`describe changes to the ${selectedLabel}…`}
                  className={inp} />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => refInputRef.current?.click()}
                    className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:border-slate-400 text-[var(--muted-foreground)] transition-colors">
                    {reference ? `🖼 ${reference.name.slice(0, 14)}` : "Reference photo"}
                  </button>
                  {reference && (
                    <button type="button" onClick={() => setReference(null)}
                      className="text-xs text-slate-400 hover:text-red-500">× clear</button>
                  )}
                </div>
                <input ref={refInputRef} type="file" accept="image/*" className="hidden"
                  onChange={e => setReference(e.target.files?.[0] ?? null)} />
                <button type="button" disabled={busy || (!instruction.trim() && !reference)}
                  onClick={() => addEdit({ kind: "item", targetLabel: selectedLabel, instruction: instruction.trim() }, reference)}
                  className={stageBtn}>
                  Add to plan
                </button>
              </div>
            )}
          </div>

          {/* Add to room */}
          <div className={`${card} p-4 space-y-2.5`}>
            <p className={sectionLabel}>Add to room</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">Place something new that isn&apos;t already there</p>
            <input type="text" value={addLabel} onChange={e => setAddLabel(e.target.value)}
              placeholder="what to add — e.g. bedside table" className={inp} />
            <input type="text" value={addPlacement} onChange={e => setAddPlacement(e.target.value)}
              placeholder="where (optional) — e.g. beside the bed" className={inp} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => addRefInputRef.current?.click()}
                className="text-xs border border-[var(--border)] px-3 py-1.5 rounded-lg hover:border-slate-400 text-[var(--muted-foreground)] transition-colors">
                {addRef ? `🖼 ${addRef.name.slice(0, 14)}` : "Reference photo"}
              </button>
              {addRef && (
                <button type="button" onClick={() => setAddRef(null)}
                  className="text-xs text-slate-400 hover:text-red-500">× clear</button>
              )}
            </div>
            <input ref={addRefInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => setAddRef(e.target.files?.[0] ?? null)} />
            <button type="button" disabled={busy || !addLabel.trim()} onClick={addNewItem} className={stageBtn}>
              Add to plan
            </button>
          </div>

          {/* Room style */}
          <div className={`${card} p-4 space-y-2.5`}>
            <p className={sectionLabel}>Room style</p>
            <div className="grid grid-cols-2 gap-1.5">
              {THEMES.map(t => (
                <button key={t.label} type="button" disabled={busy}
                  onClick={() => addEdit({ kind: "style", instruction: t.desc })}
                  className="text-xs rounded-lg border border-[var(--border)] p-2 text-slate-600 hover:border-slate-400 hover:bg-[var(--accent)] disabled:opacity-30 transition-colors text-left">
                  {t.label}
                </button>
              ))}
            </div>

            {!showCustomStyle ? (
              <button type="button" onClick={() => setShowCustomStyle(true)} className={ghostExpand}>
                + Custom style
              </button>
            ) : (
              <div className="space-y-2">
                <input type="text" value={customStyle} onChange={e => setCustomStyle(e.target.value)}
                  placeholder="e.g. Bohemian, Art Deco…" autoFocus className={inp} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy || !customStyle.trim()}
                    onClick={() => addEdit({ kind: "style", instruction: customStyle.trim() })}
                    className={stageBtn + " flex-1"}>
                    Add to plan
                  </button>
                  <button type="button" onClick={() => { setShowCustomStyle(false); setCustomStyle(""); }}
                    className="text-slate-400 hover:text-slate-600 text-sm px-2">✕</button>
                </div>
              </div>
            )}

            {!showRefine ? (
              <button type="button" onClick={() => setShowRefine(true)} className={ghostExpand}>
                + Other change
              </button>
            ) : (
              <div className="space-y-2">
                <input type="text" value={refineText} onChange={e => setRefineText(e.target.value)}
                  placeholder="e.g. repaint ceiling white…" autoFocus className={inp} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy || !refineText.trim()}
                    onClick={() => addEdit({ kind: "refine", instruction: refineText.trim() })}
                    className={stageBtn + " flex-1"}>
                    Add to plan
                  </button>
                  <button type="button" onClick={() => { setShowRefine(false); setRefineText(""); }}
                    className="text-slate-400 hover:text-slate-600 text-sm px-2">✕</button>
                </div>
              </div>
            )}

            <button type="button" disabled={busy}
              onClick={() => addEdit({ kind: "remove" })}
              className="w-full text-xs border border-[var(--border)] py-2 rounded-lg text-[var(--muted-foreground)] hover:text-slate-700 hover:border-slate-400 disabled:opacity-30 transition-colors">
              🧹 Remove all furniture
            </button>
          </div>

          {/* Staged changes */}
          {edits.length > 0 && (
            <div className={`${card} p-4 space-y-3`}>
              <p className={sectionLabel}>Staged changes</p>
              {[...itemGroups.entries()].map(([label, opts]) => (
                <div key={label} className="space-y-1.5">
                  <p className="text-[11px] text-[var(--muted-foreground)] capitalize">{label}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {opts.map((e, i) => (
                      <div key={e.id} className="relative">
                        <button type="button" onClick={() => selectOption(label, e.active ? null : e.id)}
                          title={e.instruction ?? "reference"}
                          className={`h-12 w-12 rounded-lg overflow-hidden border-2 flex items-center justify-center text-[8px] text-center p-0.5 transition-colors ${
                            e.active ? "border-slate-900" : "border-[var(--border)] hover:border-slate-400"
                          }`}>
                          {e.reference_url
                            ? /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={e.reference_url} alt={`Option ${i + 1}`} className="h-full w-full object-cover" />
                            : <span className="text-slate-500 line-clamp-3">{e.instruction ?? "change"}</span>
                          }
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(e.id)}
                          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white border border-[var(--border)] text-slate-500 text-[10px] leading-none flex items-center justify-center hover:bg-red-50 hover:text-red-500 shadow-sm">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {standalone.map(e => (
                <div key={e.id} className="flex items-center gap-2.5">
                  <button type="button" onClick={() => toggle(e.id, !e.active)}
                    className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${e.active ? "bg-slate-900" : "bg-slate-200"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${e.active ? "left-4" : "left-0.5"}`} />
                  </button>
                  <span className={`text-xs flex-1 truncate ${e.active ? "text-slate-700" : "text-slate-400 line-through"}`}>{editSummary(e)}</span>
                  <button type="button" disabled={busy} onClick={() => remove(e.id)}
                    className="text-slate-300 hover:text-red-500 text-sm shrink-0">×</button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2">{error}</div>
          )}

          {/* Generate */}
          <button type="button" onClick={generate}
            disabled={generating || busy || !canGenerate}
            className="w-full bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold py-3 rounded-xl text-sm hover:opacity-90 disabled:opacity-30 transition-opacity flex items-center justify-center gap-2 sticky bottom-4 shadow-lg shadow-slate-900/10">
            {generating
              ? <><span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Generating…</>
              : <>Generate{activeEdits.length > 0 && <span className="ml-1 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeEdits.length}</span>}</>
            }
          </button>
        </div>

        {/* ── Canvas + history ── */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center p-2">
            {previewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="Preview" className="block max-w-full max-h-[60vh] object-contain rounded-lg" />
            ) : showSlider ? (
              <div ref={imgWrapRef} className="relative select-none max-h-[60vh] inline-block"
                onPointerDown={e => { dragging.current = true; moveCompare(e.clientX); }}
                onPointerMove={e => { if (dragging.current) moveCompare(e.clientX); }}
                onPointerUp={() => { dragging.current = false; }}
                onPointerLeave={() => { dragging.current = false; }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={displayUrl} alt="After" className="block max-h-[60vh] w-auto max-w-full object-contain rounded-lg" draggable={false} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={restyle.original_url} alt="Before" draggable={false}
                  className="absolute inset-0 h-full w-full object-contain rounded-lg"
                  style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
                <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)] pointer-events-none" style={{ left: `${compare}%` }}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 text-xs">⇆</div>
                </div>
                <span className="absolute bottom-3 left-3 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white">Before</span>
                <span className="absolute bottom-3 right-3 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white">After</span>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={displayUrl} alt="Room" className="block max-w-full max-h-[60vh] object-contain rounded-lg" />
            )}

            {generating && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
                <span className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
                <span className="text-sm text-slate-600">Generating your room…</span>
              </div>
            )}

            <div className="absolute top-3 right-3 flex gap-2">
              {previewUrl && (
                <button type="button" onClick={() => setPreviewUrl(null)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-slate-600 hover:text-slate-900 border border-[var(--border)] shadow-sm transition-colors">
                  ← Current
                </button>
              )}
              <button type="button" onClick={downloadImage}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm text-slate-600 hover:text-slate-900 border border-[var(--border)] shadow-sm transition-colors">
                ↓ Save
              </button>
            </div>
          </div>

          {/* Shop this look */}
          {productEdits.length > 0 && (
            <div className={`${card} p-4 space-y-2.5`}>
              <p className={sectionLabel}>Shop this look</p>
              {productEdits.map(e => (
                <div key={e.id} className="flex items-center gap-3">
                  {e.reference_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={e.reference_url} alt="" className="h-12 w-12 rounded-lg object-cover border border-[var(--border)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 truncate">{e.product_title ?? e.target_label}</p>
                    {e.product_price && <p className="text-xs text-[var(--muted-foreground)]">{e.product_price}</p>}
                  </div>
                  <a href={e.buy_url ?? "#"} target="_blank" rel="noopener noreferrer"
                    className="bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity shrink-0">
                    Buy ↗
                  </a>
                </div>
              ))}
            </div>
          )}

          {/* History strip */}
          {renders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>History</p>
                {previewUrl && (
                  <button type="button" onClick={() => setPreviewUrl(null)}
                    className="text-[11px] text-[var(--muted-foreground)] hover:text-slate-700 underline transition-colors">
                    Back to current
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setPreviewUrl(restyle.original_url)} title="Original"
                  className={`relative shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-colors ${
                    previewUrl === restyle.original_url ? "border-slate-900" : "border-[var(--border)] hover:border-slate-400"
                  }`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={restyle.original_url} alt="Original" className="h-full w-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 text-[7px] text-center bg-black/60 text-white py-0.5">Original</span>
                </button>
                {renders.map((r, i) => (
                  <button key={r.id} type="button" onClick={() => setPreviewUrl(r.image_url)} title={`Render ${i + 1}`}
                    className={`shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition-colors ${
                      previewUrl === r.image_url ? "border-slate-900" : "border-[var(--border)] hover:border-slate-400"
                    }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.image_url} alt={`Render ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
