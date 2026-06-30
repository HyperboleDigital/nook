"use client";

import { useState, useEffect, useRef } from "react";
import type { Restyle, RestyleEdit, RestyleRender } from "@/types";
import type { ShoppingResult } from "@/lib/shopping-search";
import { ITEM_SUGGESTIONS, normalizeToCategory } from "./shared";

export type LastProduct = {
  editId: string;
  kind: "item" | "add";
  targetLabel: string;
  retailer: string;
  title: string;
  canSwap: boolean;
};

/**
 * All restyle-workspace state, side effects, API handlers and derived values in one
 * place so the page shell, guided wizard, result page and advanced panel share a single
 * source of truth. Logic is a behavior-preserving lift of the original page component.
 */
export function useRestyleWorkspace(id: string) {
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
  const [lastProduct, setLastProduct] = useState<LastProduct | null>(null);

  // Photo-first product flow
  const [productTab, setProductTab] = useState<"photo" | "link">("photo");
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [photoEditId, setPhotoEditId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<ShoppingResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Room style (advanced)
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
  const sliderHandlers = {
    onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = true; moveCompare(e.clientX); },
    onPointerMove: (e: React.PointerEvent) => { if (dragging.current) moveCompare(e.clientX); },
    onPointerUp: (e: React.PointerEvent) => { dragging.current = false; e.currentTarget.releasePointerCapture(e.pointerId); },
    onPointerCancel: () => { dragging.current = false; },
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

  // Restore the most recent visual search (loose cache, 24h) so it survives a reload.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(`nook-vs-${id}`);
        if (!raw) return;
        const { ts, results } = JSON.parse(raw) as { ts: number; results: ShoppingResult[] };
        if (Date.now() - ts < 24 * 60 * 60 * 1000 && Array.isArray(results) && results.length) {
          setCandidates(results);
        } else {
          localStorage.removeItem(`nook-vs-${id}`);
        }
      } catch { /* ignore */ }
    });
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

  const fetchProductLink = async (urlOverride?: string) => {
    const url = (urlOverride ?? productUrl).trim();
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
      setLastProduct({ editId: a.id, kind: a.kind, targetLabel: a.target_label, retailer: a.retailer, title: added?.product_title ?? a.target_label, canSwap: a.kind === "item" });
      if (!urlOverride) setProductUrl("");
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't fetch that product"); }
    finally { setFetchingProduct(false); }
  };

  // Stage the user's own screenshot as a reference and render it directly — no shopping
  // required. Keeps the file around so they can optionally search for a buyable match.
  const uploadPhotoProduct = async (file: File) => {
    setSearchFile(file); setCandidates(null); setSearchError(null);
    setFetchingProduct(true); setError(null);
    const fd = new FormData(); fd.append("image", file);
    try {
      const r = await fetch(`/api/restyle/${id}/product`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't add that photo");
      updateEdits(data.edits);
      const a = data.added;
      setPhotoEditId(a.id);
      setLastProduct({ editId: a.id, kind: a.kind, targetLabel: a.target_label, retailer: a.retailer, title: a.target_label, canSwap: a.kind === "item" });
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't add that photo"); }
    finally { setFetchingProduct(false); }
  };

  const runVisualSearch = async (file: File) => {
    setSearching(true); setSearchError(null); setCandidates(null);
    const fd = new FormData(); fd.append("image", file);
    try {
      const r = await fetch(`/api/restyle/${id}/visual-search`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't search for that item");
      const results = data.results as ShoppingResult[];
      setCandidates(results);
      try { localStorage.setItem(`nook-vs-${id}`, JSON.stringify({ ts: Date.now(), results })); } catch { /* quota */ }
    } catch (err) { setSearchError(err instanceof Error ? err.message : "Search failed"); }
    finally { setSearching(false); }
  };

  // Pick a real product the search found. It replaces the photo staged from the
  // screenshot (same item, now with proper details + a Buy link) — no duplicate row.
  const pickCandidate = async (c: ShoppingResult) => {
    if (!c.supported || (!c.immersiveToken && !c.productUrl)) return;
    const replacingId = photoEditId;
    setCandidates(null); setFetchingProduct(true); setError(null);
    try {
      const r = await fetch(`/api/restyle/${id}/product`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c.productUrl ? { url: c.productUrl } : { token: c.immersiveToken }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't fetch that product");
      let editList = data.edits as RestyleEdit[];
      const a = data.added;
      if (replacingId && replacingId !== a.id) {
        try {
          const dr = await fetch(`/api/restyle/${id}/edits?editId=${replacingId}`, { method: "DELETE" });
          const dd = await dr.json();
          if (dr.ok) editList = dd.edits as RestyleEdit[];
        } catch { /* best effort */ }
      }
      setPhotoEditId(null);
      updateEdits(editList);
      const added = editList.find(e => e.id === a.id);
      setLastProduct({ editId: a.id, kind: a.kind, targetLabel: a.target_label, retailer: a.retailer, title: added?.product_title ?? a.target_label, canSwap: a.kind === "item" });
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't fetch that product"); }
    finally { setFetchingProduct(false); }
  };

  const setProductMode = async (newKind: "item" | "add") => {
    if (!lastProduct || lastProduct.kind === newKind) return;
    updateEdits((restyle?.edits ?? []).map(e => e.id === lastProduct.editId ? { ...e, kind: newKind } : e));
    setLastProduct({ ...lastProduct, kind: newKind });
    try {
      await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId: lastProduct.editId, kind: newKind }),
      });
    } catch { /* best effort — optimistic already set */ }
  };

  const clearLastProduct = () => { setLastProduct(null); setSearchFile(null); setPhotoEditId(null); };

  const generate = async () => {
    setGenerating(true); setError(null); setPreviewUrl(null);
    try {
      const r = await fetch(`/api/restyle/${id}/generate`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Generate failed");
      setRestyle(prev => prev ? { ...prev, current_url: data.url, edits: data.edits } : prev);
      if (data.renders) setRenders(data.renders);
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Generate failed"); return false; }
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

  // ── Derived ──
  const loading = !restyle || objects === null;
  const edits = restyle?.edits ?? [];
  const activeEdits = edits.filter(e => e.active);
  const displayUrl = previewUrl ?? restyle?.current_url ?? "";
  const showSlider = !previewUrl && !!restyle && displayUrl !== restyle.original_url;
  const canGenerate = activeEdits.length > 0;
  const atMaxCustom = (restyle?.custom_items?.length ?? 0) >= 5;
  const suggestions = selectedLabel ? (ITEM_SUGGESTIONS[normalizeToCategory(selectedLabel)] ?? []) : [];

  const itemGroups = new Map<string, RestyleEdit[]>();
  const standalone: RestyleEdit[] = [];
  for (const e of edits) {
    if (e.kind === "item" && e.target_label) {
      const arr = itemGroups.get(e.target_label) ?? []; arr.push(e);
      itemGroups.set(e.target_label, arr);
    } else standalone.push(e);
  }
  // "Shop this look" reflects only the product(s) in the image currently on screen.
  const displayedRender = renders.find(r => r.image_url === displayUrl);
  const shownProductIds: Set<string> | null =
    restyle && displayUrl === restyle.original_url ? new Set()
    : displayedRender ? new Set(displayedRender.signature.split(","))
    : null;
  const productEdits = edits.filter(e =>
    e.buy_url && (shownProductIds ? shownProductIds.has(e.id) : e.active)
  );

  return {
    id, restyle, renders, objects: objects ?? [], loading,
    busy, generating, error, setError,
    titleDraft, setTitleDraft, saveTitle,
    // modify
    selectedLabel, setSelectedLabel, instruction, setInstruction, reference, setReference,
    refInputRef, showItemInput, setShowItemInput, newItemName, setNewItemName,
    // add
    addLabel, setAddLabel, addPlacement, setAddPlacement, addRef, setAddRef, addRefInputRef,
    // product
    productUrl, setProductUrl, fetchingProduct, lastProduct, setLastProduct, clearLastProduct,
    productTab, setProductTab, screenshotInputRef, searchFile, photoEditId,
    searching, candidates, setCandidates, searchError, setSearchError,
    // style (advanced)
    showCustomStyle, setShowCustomStyle, customStyle, setCustomStyle,
    showRefine, setShowRefine, refineText, setRefineText,
    // slider
    compare, imgWrapRef, sliderHandlers,
    // preview
    previewUrl, setPreviewUrl,
    // handlers
    addEdit, addNewItem, fetchProductLink, uploadPhotoProduct, runVisualSearch, pickCandidate,
    setProductMode, generate, toggle, selectOption, remove, addCustomItem, removeCustomItem, downloadImage,
    // derived
    edits, activeEdits, displayUrl, showSlider, canGenerate, atMaxCustom, suggestions,
    itemGroups, standalone, productEdits,
  };
}

export type RestyleWorkspace = ReturnType<typeof useRestyleWorkspace>;
