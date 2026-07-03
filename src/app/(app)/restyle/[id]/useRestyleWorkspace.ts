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
  // "similar" = a clean product-card list for an already-placed item (find an alternative);
  // "compose" = the link/photo/describe sourcing form for an empty slot.
  view: "similar" | "compose";
  stagedEditId: string | null;
  lastStaged?: { title: string; retailer: string };
} | null;

const EMPTY_SEARCH: SearchState = { status: "idle", scored: false, results: [] };
const OPTIMISTIC_PREFIX = "optimistic-";

// Walls and a bare ceiling aren't furniture/decor items there's a product to swap them for —
// filter them out of hotspots and the chip row entirely. Careful not to drop legitimate
// swappable items that share the word, like "wall art"/"wall mirror" or "ceiling fan"/
// "ceiling light".
const NOT_SWAPPABLE = /^(the\s+)?(left|right|back|front|far)?\s*(walls?|ceiling)$/i;
const swappableObjects = (objs: DetectedObject[]) => objs.filter((o) => !NOT_SWAPPABLE.test(o.label.trim()));

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
        if (active) setObjects(swappableObjects(d.detected_objects));
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
          if (active) { setObjects(swappableObjects(pd.detected_objects)); setRestyle((prev) => prev ? { ...prev, detected_objects: pd.detected_objects } : prev); setDetecting(false); }
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
        if (active) setObjects(swappableObjects(dj.objects ?? []));
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
  // Compose: the link/photo/describe form, for sourcing an empty slot from scratch.
  const openSourcing = (label: string, mode: "swap" | "add") => setSourcing({ label, mode, view: "compose", stagedEditId: null });
  // Similar: a clean product-card list for a slot that already has something placed —
  // matches the "Show similar" flow from a hotspot/chip/shop-list item, not a blank compose.
  const openSimilar = (label: string, mode: "swap" | "add", stagedEditId: string | null) =>
    setSourcing({ label, mode, view: "similar", stagedEditId });
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

  // Search using a photo that's ALREADY staged (its reference_url) rather than a fresh
  // upload — used after generate to look up buyable options for inspo-only items that made
  // it into the render, without re-cropping/re-hosting an image we already have.
  const runVisualSearchByUrl = async (imageUrl: string, label: string) => {
    setSearchState(label, { status: "loading", scored: false });
    const fd = new FormData();
    fd.append("imageUrl", imageUrl); fd.append("label", label);
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

  // Stage an inspo photo — just a reference for the render, nothing to buy. No shopping
  // search runs here anymore: that used to fire the moment a photo was picked (an API call —
  // and a token cost — the user might not even want yet, since they could still be deciding).
  // It's deferred to after generate(), which looks up options for whatever inspo photos
  // actually made it into the render (see the search kickoff there).
  const stagePhoto = async (file: File, label: string) => {
    const replaceEditId = sourcing?.label === label ? sourcing.stagedEditId ?? undefined : undefined;
    setStagingLink(true); setError(null);
    const fd = new FormData();
    fd.append("image", file); fd.append("targetLabel", label);
    if (replaceEditId) fd.append("replaceEditId", replaceEditId);
    try {
      const r = await fetch(`/api/restyle/${id}/product`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't add that photo");
      updateEdits(data.edits);
      setSourcing((s) => s && s.label === label
        ? { ...s, stagedEditId: data.added.id, lastStaged: { title: data.added.target_label ?? label, retailer: "" } }
        : s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that photo");
    } finally {
      setStagingLink(false);
    }
  };

  // Optimistic: the picked candidate appears staged immediately (thumbnail/title/price from
  // the search result itself — no need to wait on the network for what the user already sees
  // on screen); reconciled with the server's real edit list on success, rolled back on failure.
  // replaceEditId is explicit (not derived from `sourcing`) because this is also called from
  // "Shop this look" after generate, where there's no open sourcing panel to read it from.
  const pickCandidate = async (c: ShoppingResult, label: string, key: string, replaceEditId?: string) => {
    if (!c.supported || (!c.immersiveToken && !c.productUrl)) return;
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

      // Now that the room is actually generated, look up buyable options for any inspo-only
      // items (uploaded photos with no product link yet) that ended up in this render — this
      // is the deferred half of "upload a photo": staging it earlier didn't search, so search
      // happens now against whatever actually made it into the picture.
      const inspo = (data.edits as RestyleEdit[]).filter(
        (e) => e.active && e.reference_url && !e.buy_url && e.target_label,
      );
      for (const e of inspo) runVisualSearchByUrl(e.reference_url!, e.target_label!.toLowerCase());

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
  const viewingOriginal = !!restyle && displayUrl === restyle.original_url;
  const showSlider = !previewUrl && !!restyle && !viewingOriginal;
  const hasOptimistic = activeEdits.some((e) => e.id.startsWith(OPTIMISTIC_PREFIX));
  const canGenerate = activeEdits.length > 0 && !hasOptimistic;
  const atMaxCustom = (restyle?.custom_items?.length ?? 0) >= 5;

  // "Shop this look" reflects only the product(s) in the image currently on screen.
  const displayedRender = renders.find((r) => r.image_url === displayUrl);
  const shownProductIds: Set<string> | null =
    viewingOriginal ? new Set()
    : displayedRender ? new Set(displayedRender.signature.split(","))
    : null;
  const productEdits = edits.filter((e) => e.buy_url && (shownProductIds ? shownProductIds.has(e.id) : e.active));
  // Inspo-only items in the current render — staged from a photo, no product link yet.
  // "Shop this look" looks up buyable options for these once a render exists.
  const inspoEdits = edits.filter((e) =>
    e.reference_url && !e.buy_url && e.target_label && (shownProductIds ? shownProductIds.has(e.id) : e.active),
  );

  // Hotspot positions for shoppable items on a RENDER — we only ever detected positions on
  // the original photo, so approximate by reusing the swapped-out object's original box_2d
  // (a swap usually stays roughly where the original piece was). "add" items have no known
  // original position and don't get a render hotspot; they still show in the shop list below.
  const detectedByLabel = new Map((restyle?.detected_objects ?? []).map((o) => [o.label.toLowerCase(), o.box_2d]));
  const renderHotspots = edits
    .filter((e) => e.kind === "item" && e.target_label && (shownProductIds ? shownProductIds.has(e.id) : e.active))
    .map((e) => {
      const box = detectedByLabel.get((e.target_label as string).toLowerCase());
      return box ? { label: e.target_label as string, box_2d: box, edit: e } : null;
    })
    .filter((h): h is { label: string; box_2d: DetectedObject["box_2d"]; edit: RestyleEdit } => h !== null);

  return {
    id, restyle, renders, objects: objects ?? [], customItems: restyle?.custom_items ?? [], detecting, loading,
    busy, generating, error, setError,
    titleDraft, setTitleDraft, saveTitle,
    sourcing, openSourcing, openSimilar, closeSourcing,
    searches, runVisualSearchByUrl, runTextSearch, pickCandidate, pickingKey,
    stagePhoto, stageProductLink, stagingLink,
    // slider
    compare, imgWrapRef, sliderHandlers,
    // preview
    previewUrl, setPreviewUrl,
    // handlers
    addEdit, toggle, remove, addCustomItem, removeCustomItem, generate, emptyRoom, downloadImage,
    // derived
    edits, activeEdits, stagedItems, displayUrl, viewingOriginal, showSlider, canGenerate, atMaxCustom, productEdits, inspoEdits,
    renderHotspots,
  };
}

export type RestyleWorkspace = ReturnType<typeof useRestyleWorkspace>;
