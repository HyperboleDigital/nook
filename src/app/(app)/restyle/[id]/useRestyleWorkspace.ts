"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { DetectedObject, Restyle, RestyleEdit, RestyleRender } from "@/types";
import type { ShoppingResult } from "@/lib/shopping-search";

export type SearchState = {
  status: "idle" | "loading" | "ready" | "error";
  scored: boolean;
  results: ShoppingResult[];
  error?: string;
};

export type Sourcing = {
  label: string;           // "" until the AI identifies an unlabeled "add" item
  mode: "swap" | "add";
  stagedEditId: string | null;
  lastStaged?: { title: string; retailer: string };
} | null;

const EMPTY_SEARCH: SearchState = { status: "idle", scored: false, results: [] };
const OPTIMISTIC_PREFIX = "optimistic-";

/**
 * All restyle-workspace state, side effects, and API handlers in one place so the studio
 * shell, canvas, and sourcing panel share a single source of truth. Search results are keyed
 * by item label and hydrated from the server (GET /searches) instead of client localStorage,
 * so they survive reloads and work across devices. Picking a candidate is optimistic — the
 * edit appears staged immediately and reconciles (or rolls back) once the server responds.
 */
export function useRestyleWorkspace(id: string) {
  const [restyle, setRestyle] = useState<Restyle | null>(null);
  const [renders, setRenders] = useState<RestyleRender[]>([]);
  const [objects, setObjects] = useState<DetectedObject[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");

  // The item currently being sourced (chip/hotspot tapped, or "+ Add" pressed).
  const [sourcing, setSourcing] = useState<Sourcing>(null);
  const [searches, setSearches] = useState<Record<string, SearchState>>({});
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [stagingLink, setStagingLink] = useState(false);

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

  // ── Load: project + persisted searches in parallel, then poll detection if pending ──
  useEffect(() => {
    let active = true;
    (async () => {
      const [restyleRes, searchesRes] = await Promise.all([
        fetch(`/api/restyles/${id}`),
        fetch(`/api/restyle/${id}/searches`).catch(() => null),
      ]);
      if (!active || !restyleRes.ok) return;
      const d: Restyle = await restyleRes.json();
      setRestyle(d);
      setRenders(d.renders ?? []);
      setTitleDraft(d.title ?? "");

      if (searchesRes?.ok) {
        const sj = await searchesRes.json();
        const hydrated: Record<string, SearchState> = {};
        for (const row of sj.searches ?? []) {
          hydrated[row.label] = { status: "ready", scored: row.scored, results: row.results ?? [] };
        }
        if (active) setSearches(hydrated);
      }

      if (d.detected_objects && d.detected_objects.length > 0) {
        if (active) setObjects(d.detected_objects);
        return;
      }

      // Detection was fired in the background at create time — poll briefly for it to land
      // before falling back to a synchronous detect call.
      if (active) setDetecting(true);
      for (let i = 0; i < 10 && active; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pr = await fetch(`/api/restyles/${id}`);
        if (!pr.ok) continue;
        const pd: Restyle = await pr.json();
        if (pd.detected_objects && pd.detected_objects.length > 0) {
          if (active) { setObjects(pd.detected_objects); setRestyle((prev) => prev ? { ...prev, detected_objects: pd.detected_objects } : prev); setDetecting(false); }
          return;
        }
      }
      if (!active) return;
      try {
        const dr = await fetch("/api/restyle/detect", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: d.original_url, restyleId: id }),
        });
        const dj = await dr.json();
        if (active) setObjects(dj.objects ?? []);
      } catch {
        if (active) setObjects([]);
      } finally {
        if (active) setDetecting(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const saveTitle = async (t: string) => {
    const trimmed = t.trim();
    if (trimmed === (restyle?.title ?? "")) return;
    setRestyle((prev) => prev ? { ...prev, title: trimmed || null } : prev);
    try {
      await fetch(`/api/restyles/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
    } catch { /* best effort */ }
  };

  const updateEdits = (edits: RestyleEdit[]) => setRestyle((prev) => prev ? { ...prev, edits } : prev);

  // ── Sourcing panel open/close ──
  const openSourcing = (label: string, mode: "swap" | "add") => setSourcing({ label, mode, stagedEditId: null });
  const closeSourcing = () => setSourcing(null);

  // Text-only edit with no product — "just go with my description".
  const addEdit = async (fields: Record<string, string>) => {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      const r = await fetch(`/api/restyle/${id}/edits`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed");
      updateEdits(data.edits);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const setSearchState = (label: string, patch: Partial<SearchState> | ((prev: SearchState) => SearchState)) =>
    setSearches((prev) => ({
      ...prev,
      [label]: typeof patch === "function" ? patch(prev[label] ?? EMPTY_SEARCH) : { ...(prev[label] ?? EMPTY_SEARCH), ...patch },
    }));

  // Poll the persisted search row until Gemini scoring + Wayfair token resolution land
  // (the response we already applied is unscored so the user isn't staring at nothing).
  const pollScored = useCallback(async (label: string) => {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const r = await fetch(`/api/restyle/${id}/searches?label=${encodeURIComponent(label)}`);
        if (!r.ok) continue;
        const data = await r.json();
        const row = data.searches?.[0];
        if (row?.scored) { setSearchState(label, { status: "ready", scored: true, results: row.results ?? [] }); return; }
      } catch { /* keep polling */ }
    }
  }, [id]);

  // stage=true also creates the reference edit from this image in the same request (the
  // photo becomes the render reference immediately; picking a real match later replaces it).
  const runVisualSearch = async (file: File, label: string, opts?: { stage?: boolean }) => {
    setSearchState(label, { status: "loading", scored: false });
    const fd = new FormData();
    fd.append("image", file); fd.append("label", label);
    if (opts?.stage) fd.append("stage", "1");
    try {
      const r = await fetch(`/api/restyle/${id}/visual-search`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't search for that item");
      setSearchState(label, { status: "ready", scored: !!data.scored, results: data.results ?? [] });
      if (data.edits) {
        updateEdits(data.edits);
        setSourcing((s) => s && s.label === label
          ? { ...s, stagedEditId: data.added?.id ?? s.stagedEditId, lastStaged: { title: data.added?.target_label ?? label, retailer: "" } }
          : s);
      }
      if (!data.scored) pollScored(label);
    } catch (err) {
      setSearchState(label, { status: "error", error: err instanceof Error ? err.message : "Search failed" });
    }
  };

  const runTextSearch = async (query: string, label: string) => {
    if (!query.trim()) return;
    setSearchState(label, { status: "loading", scored: false });
    const fd = new FormData();
    fd.append("query", query.trim()); fd.append("label", label);
    try {
      const r = await fetch(`/api/restyle/${id}/visual-search`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't search for that item");
      setSearchState(label, { status: "ready", scored: !!data.scored, results: data.results ?? [] });
      if (!data.scored) pollScored(label);
    } catch (err) {
      setSearchState(label, { status: "error", error: err instanceof Error ? err.message : "Search failed" });
    }
  };

  // Stage a pasted retailer link directly — independent of search, for when the agent
  // already has the exact product URL in hand.
  const stageProductLink = async (url: string, label: string) => {
    if (!url.trim()) return;
    const replaceEditId = sourcing?.label === label ? sourcing.stagedEditId ?? undefined : undefined;
    setStagingLink(true); setError(null);
    try {
      const body: Record<string, unknown> = { url: url.trim(), targetLabel: label };
      if (replaceEditId) body.replaceEditId = replaceEditId;
      const r = await fetch(`/api/restyle/${id}/product`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't fetch that product");
      updateEdits(data.edits);
      setSourcing((s) => s && s.label === label
        ? { ...s, stagedEditId: data.added.id, lastStaged: { title: data.added.target_label, retailer: data.added.retailer } }
        : s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't fetch that product");
    } finally {
      setStagingLink(false);
    }
  };

  // Optimistic: the picked candidate appears staged immediately (thumbnail/title/price from
  // the search result itself — no need to wait on the network for what the user already sees
  // on screen); reconciled with the server's real edit list on success, rolled back on failure.
  const pickCandidate = async (c: ShoppingResult, label: string, key: string) => {
    if (!c.supported || (!c.immersiveToken && !c.productUrl)) return;
    const replaceEditId = sourcing?.label === label ? sourcing.stagedEditId ?? undefined : undefined;
    const optimisticId = `${OPTIMISTIC_PREFIX}${Date.now()}`;
    const prevEdits = restyle?.edits ?? [];
    const optimisticEdit: RestyleEdit = {
      id: optimisticId, restyle_id: id, kind: "item", target_label: label,
      instruction: null, reference_url: c.thumbnail || null, reference_desc: null,
      active: true, position: prevEdits.length, created_at: new Date().toISOString(),
      buy_url: c.productUrl, product_title: c.title, product_price: c.price,
    };
    updateEdits([...prevEdits.filter((e) => e.id !== replaceEditId), optimisticEdit]);
    setPickingKey(key); setError(null);
    try {
      const body: Record<string, unknown> = c.productUrl ? { url: c.productUrl } : { token: c.immersiveToken };
      body.targetLabel = label;
      if (replaceEditId) body.replaceEditId = replaceEditId;
      const r = await fetch(`/api/restyle/${id}/product`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't fetch that product");
      updateEdits(data.edits);
      setSourcing((s) => s && s.label === label
        ? { ...s, stagedEditId: data.added.id, lastStaged: { title: data.added.target_label, retailer: data.added.retailer } }
        : s);
    } catch (err) {
      updateEdits(prevEdits); // roll back the optimistic edit
      setError(err instanceof Error ? err.message : "Couldn't fetch that product");
    } finally {
      setPickingKey(null);
    }
  };

  const generate = async () => {
    setGenerating(true); setError(null); setPreviewUrl(null);
    try {
      const r = await fetch(`/api/restyle/${id}/generate`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Generate failed");
      setRestyle((prev) => prev ? { ...prev, current_url: data.url, edits: data.edits } : prev);
      if (data.renders) setRenders(data.renders);
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Generate failed"); return false; }
    finally { setGenerating(false); }
  };

  // Deactivate everything, ensure a "remove" edit, generate — a bare room.
  const emptyRoom = async () => {
    const active = restyle?.edits?.filter((e) => e.active) ?? [];
    for (const e of active) if (e.kind !== "remove") await toggle(e.id, false);
    const hasRemoveAll = restyle?.edits?.some((e) => e.kind === "remove" && e.active);
    if (!hasRemoveAll) await addEdit({ kind: "remove" });
    return generate();
  };

  const toggle = async (editId: string, active: boolean) => {
    updateEdits((restyle?.edits ?? []).map((e) => (e.id === editId ? { ...e, active } : e)));
    try {
      await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId, active }),
      });
    } catch { /* best effort — optimistic is already set */ }
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
      setRestyle((prev) => prev ? { ...prev, custom_items: data.custom_items } : prev);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
  };

  const removeCustomItem = async (label: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/restyle/${id}/items?label=${encodeURIComponent(label)}`, { method: "DELETE" });
      const data = await r.json();
      if (r.ok) setRestyle((prev) => prev ? { ...prev, custom_items: data.custom_items, edits: data.edits } : prev);
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
  const activeEdits = edits.filter((e) => e.active);
  const stagedItems = activeEdits.filter((e) => e.kind === "item" || e.kind === "add");
  const displayUrl = previewUrl ?? restyle?.current_url ?? "";
  const showSlider = !previewUrl && !!restyle && displayUrl !== restyle.original_url;
  const hasOptimistic = activeEdits.some((e) => e.id.startsWith(OPTIMISTIC_PREFIX));
  const canGenerate = activeEdits.length > 0 && !hasOptimistic;
  const atMaxCustom = (restyle?.custom_items?.length ?? 0) >= 5;

  // "Shop this look" reflects only the product(s) in the image currently on screen.
  const displayedRender = renders.find((r) => r.image_url === displayUrl);
  const shownProductIds: Set<string> | null =
    restyle && displayUrl === restyle.original_url ? new Set()
    : displayedRender ? new Set(displayedRender.signature.split(","))
    : null;
  const productEdits = edits.filter((e) => e.buy_url && (shownProductIds ? shownProductIds.has(e.id) : e.active));

  return {
    id, restyle, renders, objects: objects ?? [], customItems: restyle?.custom_items ?? [], detecting, loading,
    busy, generating, error, setError,
    titleDraft, setTitleDraft, saveTitle,
    sourcing, openSourcing, closeSourcing,
    searches, runVisualSearch, runTextSearch, pickCandidate, pickingKey,
    stageProductLink, stagingLink,
    // slider
    compare, imgWrapRef, sliderHandlers,
    // preview
    previewUrl, setPreviewUrl,
    // handlers
    addEdit, toggle, remove, addCustomItem, removeCustomItem, generate, emptyRoom, downloadImage,
    // derived
    edits, activeEdits, stagedItems, displayUrl, showSlider, canGenerate, atMaxCustom, productEdits,
  };
}

export type RestyleWorkspace = ReturnType<typeof useRestyleWorkspace>;
