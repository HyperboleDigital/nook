"use client";

import { useState, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
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

// A tappable position on whichever image is currently displayed (original or a render) — see
// the canvasHotspots derivation below for what each state means and how it's computed.
export type CanvasHotspot = {
  label: string;
  box_2d: DetectedObject["box_2d"];
  state: "idle" | "queued" | "placed";
  edit: RestyleEdit | null;
};

const EMPTY_SEARCH: SearchState = { status: "idle", scored: false, results: [] };
const OPTIMISTIC_PREFIX = "optimistic-";

// Walls, windows, a bare ceiling, and a bare floor are architecture, not furniture/decor
// there's a product to swap them for — filter them out of hotspots and the chip row entirely.
// Matched by TRAILING word, so multi-word surfaces like "dark tiled wall" or "back windows"
// are caught too, while genuinely swappable items that merely start with the word survive
// ("wall art"/"wall mirror", "window curtains"/"window treatment", "ceiling fan"/"ceiling
// light", "floor lamp" — their real noun is the last word, so they don't match).
const NOT_SWAPPABLE = /(^|\s)(walls?|windows?|ceilings?|floors?)$/i;
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
  // Epoch ms a generate started at — set directly by generate() or adopted from the server's
  // restyles.generating_started_at on load, so a fresh reload can resume showing progress
  // instead of the render finishing invisibly while the user was away. `generating` (below)
  // is derived from this so a resumed in-flight generate reads the same as one just clicked.
  const [generatingStartedAt, setGeneratingStartedAt] = useState<number | null>(null);
  const generating = generatingStartedAt !== null;
  const [error, setError] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState("");

  // The item currently being sourced (chip/hotspot tapped, or "+ Add" pressed).
  const [sourcing, setSourcing] = useState<Sourcing>(null);
  const [searches, setSearches] = useState<Record<string, SearchState>>({});
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [stagingLink, setStagingLink] = useState(false);

  // History preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Tap-to-place pin for an "add" edit — offered right after it stages successfully.
  // Optional: Skip/cancel leaves placement null and generate is never blocked on it.
  const [pinRequest, setPinRequest] = useState<{ editId: string; label: string } | null>(null);

  // Poll an in-flight generate (just kicked off, or resumed from a reload) until the server
  // clears generating_started_at. The render AND the deferred inspo product search both run
  // fully server-side (see the generate route's after()), so this loop is read-only — it just
  // waits and then hydrates whatever the server already finished, including search results
  // that ran while the client may have been disconnected entirely.
  const pollGenerating = useCallback(async (startedAt: number) => {
    const STALE_MS = 6.5 * 60 * 1000; // past maxDuration=300 + buffer
    for (;;) {
      await new Promise((r) => setTimeout(r, 4000));
      if (Date.now() - startedAt > STALE_MS) {
        setGeneratingStartedAt(null);
        setError("This render seems to have stalled. Try generating again.");
        return;
      }
      try {
        const r = await fetch(`/api/restyles/${id}`);
        if (!r.ok) continue;
        const d: Restyle = await r.json();
        if (!d.generating_started_at) {
          setRestyle((prev) => prev ? { ...prev, current_url: d.current_url, edits: d.edits } : d);
          if (d.renders) setRenders(d.renders);
          if (d.generate_error) setError(d.generate_error);
          setGeneratingStartedAt(null);
          try {
            const sr = await fetch(`/api/restyle/${id}/searches`);
            if (sr.ok) {
              const sj = await sr.json();
              const hydrated: Record<string, SearchState> = {};
              for (const row of sj.searches ?? []) {
                hydrated[row.label] = { status: "ready", scored: row.scored, results: row.results ?? [] };
              }
              setSearches((prev) => ({ ...prev, ...hydrated }));
            }
          } catch { /* best effort */ }
          return;
        }
      } catch { /* keep polling */ }
    }
  }, [id]);

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

      // A generate was in flight when this project was last touched — the underlying render
      // survives a closed tab (it's a normal serverless invocation that runs to completion),
      // but nothing told the UI until now. Resume showing progress and poll until it clears.
      if (d.generating_started_at) {
        const startedAt = new Date(d.generating_started_at).getTime();
        setGeneratingStartedAt(startedAt);
        pollGenerating(startedAt);
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
  }, [id, pollGenerating]);

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

  // Offer to pin an add edit's location — forces the original photo into view (pins are
  // captured in the same 0–1000 coordinate space as detected_objects) and closes any open
  // sourcing panel so the pin layer has the canvas to itself.
  const requestPin = (editId: string, label: string) => {
    setSourcing(null);
    if (restyle) setPreviewUrl(restyle.original_url);
    setPinRequest({ editId, label });
  };
  const cancelPin = () => setPinRequest(null);

  // Persist a pin (or clear it with null). Optimistic; the server also deletes any cached
  // render whose signature contains this edit id, since its content just changed.
  const setPlacement = async (editId: string, placement: { x: number; y: number; note?: string | null } | null) => {
    updateEdits((restyle?.edits ?? []).map((e) => (e.id === editId ? { ...e, placement } : e)));
    setPinRequest((p) => (p?.editId === editId ? null : p));
    try {
      const r = await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId, placement }),
      });
      const data = await r.json();
      if (r.ok) updateEdits(data.edits);
    } catch { /* best effort — optimistic is already set */ }
  };

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
      // stageEdit may reclassify a would-be add into a swap when the label matches a
      // detected object — only offer a pin for a genuine, still-unplaced add.
      if (data.added.kind === "add") requestPin(data.added.id, data.added.target_label ?? label);
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
  //
  // Optimistic, same pattern as pickCandidate below: the sourcing panel closes immediately
  // and the photo appears queued right away (using a local object URL as its thumbnail) —
  // identifying the item and cropping it (server-side Gemini calls) happens in the background
  // and reconciles once done, rather than making the user watch a multi-second spinner before
  // they can even tell it worked. Uploads the raw photo straight to Vercel Blob first (same
  // signed-token route the initial room-photo upload uses), then sends only the resulting URL
  // as JSON — closing the tab mid-upload just loses that unfinished transfer, not a staged edit.
  const stagePhoto = async (file: File, label: string) => {
    const replaceEditId = sourcing?.label === label ? sourcing.stagedEditId ?? undefined : undefined;
    const guessedKind = sourcing?.mode === "add" ? "add" : "item";
    setError(null);

    const optimisticId = `${OPTIMISTIC_PREFIX}${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    const prevEdits = restyle?.edits ?? [];
    const optimisticEdit: RestyleEdit = {
      id: optimisticId, restyle_id: id, kind: guessedKind, target_label: label,
      instruction: null, reference_url: localUrl, reference_desc: null,
      active: true, position: prevEdits.length, created_at: new Date().toISOString(),
      buy_url: null, product_title: null, product_price: null, placement: null,
    };
    updateEdits([...prevEdits.filter((e) => e.id !== replaceEditId), optimisticEdit]);
    setSourcing(null); // the item already shows as queued — no need to keep the panel open

    try {
      const ext = file.type.split("/")[1] || "jpg";
      const blob = await upload(
        `restyle-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
        file,
        { access: "public", handleUploadUrl: "/api/restyle/upload-url", multipart: true },
      );
      const r = await fetch(`/api/restyle/${id}/product`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: blob.url, targetLabel: label, replaceEditId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't add that photo");
      updateEdits(data.edits);
      if (data.added.kind === "add") requestPin(data.added.id, data.added.target_label ?? label);
    } catch (err) {
      updateEdits(prevEdits); // roll back the optimistic edit
      setError(err instanceof Error ? err.message : "Couldn't add that photo");
    } finally {
      URL.revokeObjectURL(localUrl);
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
      placement: null,
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
      if (data.added.kind === "add") requestPin(data.added.id, data.added.target_label ?? label);
    } catch (err) {
      updateEdits(prevEdits); // roll back the optimistic edit
      setError(err instanceof Error ? err.message : "Couldn't fetch that product");
    } finally {
      setPickingKey(null);
    }
  };

  // Fire-and-forget: POST returns 202 immediately (the render + deferred inspo search run
  // fully server-side in the route's after()), then this hands off to pollGenerating, which
  // is the single place that adopts the finished result — whether generate() called it just
  // now or a page reload resumed an already-in-flight one. An optional body can apply a
  // server-side edit-state change (toggle one edit, or empty the room) atomically before
  // rendering, so those flows never depend on a client-side loop surviving to the end.
  const generate = async (body?: { toggle?: { editId: string; active: boolean }; emptyRoom?: boolean }) => {
    setError(null); setPreviewUrl(null); setPinRequest(null);
    try {
      const r = await fetch(`/api/restyle/${id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Generate failed");
      const startedAt = new Date(data.generatingStartedAt).getTime();
      setGeneratingStartedAt(startedAt);
      await pollGenerating(startedAt);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
      setGeneratingStartedAt(null);
      return false;
    }
  };

  // Whole-room reset — server applies "deactivate everything, ensure a whole-room remove
  // edit" atomically before rendering (see the generate route's `emptyRoom` handling).
  const emptyRoom = () => generate({ emptyRoom: true });

  const toggle = async (editId: string, active: boolean) => {
    updateEdits((restyle?.edits ?? []).map((e) => (e.id === editId ? { ...e, active } : e)));
    try {
      await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId, active }),
      });
    } catch { /* best effort — optimistic is already set */ }
  };

  // A simple on/off switch for a single item already in the picture: flip it (optimistically,
  // for instant hotspot/list feedback) and regenerate right away, with the toggle itself
  // applied server-side as part of the same generate call — a combination already seen before
  // is an instant cache hit (restyle_renders' signature cache), a new one pays the real render
  // cost, surfaced via the ProgressOverlay.
  const toggleAndRegenerate = async (editId: string, active: boolean) => {
    updateEdits((restyle?.edits ?? []).map((e) => (e.id === editId ? { ...e, active } : e)));
    await generate({ toggle: { editId, active } });
  };

  // Batch-deactivate every active edit in one call (used by "Start from original" — GenerateBar
  // used to do this as a client for-loop of individual toggles, which left a partial state if
  // the tab closed mid-loop; the edits route's `states` map applies it atomically).
  const deactivateAll = async () => {
    const activeIds = (restyle?.edits ?? []).filter((e) => e.active).map((e) => e.id);
    if (activeIds.length === 0) return;
    updateEdits((restyle?.edits ?? []).map((e) => (activeIds.includes(e.id) ? { ...e, active: false } : e)));
    try {
      const states: Record<string, boolean> = {};
      for (const eid of activeIds) states[eid] = false;
      const r = await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ states }),
      });
      const data = await r.json();
      if (r.ok) updateEdits(data.edits);
    } catch { /* best effort — optimistic is already set */ }
  };

  // Remove a detected item from the room entirely (distinct from un-toggling a swap, which
  // just reverts to the original item) — stages a targeted `remove` edit for this label.
  const stageRemove = async (label: string) => {
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", "remove"); fd.append("targetLabel", label);
      const r = await fetch(`/api/restyle/${id}/edits`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't remove that item");
      updateEdits(data.edits);
      setSourcing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that item");
    }
  };

  const remove = async (editId: string) => {
    setBusy(true);
    setPinRequest((p) => (p?.editId === editId ? null : p));
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
  const stagedItems = activeEdits.filter((e) => e.kind === "item" || e.kind === "add" || (e.kind === "remove" && e.target_label));
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
  // Targeted removes actually in the current render — shown as a "Removed" section with a
  // Restore action rather than a hotspot (an empty floor isn't something to tap).
  const removedEdits = edits.filter((e) =>
    e.kind === "remove" && e.target_label && (shownProductIds ? shownProductIds.has(e.id) : e.active),
  );

  // Unified hotspots for whichever image is on screen — the render is a canvas too, not a
  // dead end: every detected item stays tappable so the user can keep swapping/adding and
  // regenerating from it. A hotspot's state is derived from the same shownProductIds used
  // above, so "placed" (this change IS in the pictured image) can only ever occur on a
  // render — on the original, shownProductIds is always empty, so every match falls through
  // to "queued" or "idle". This makes the "never show placed UI on the original" rule hold
  // by construction instead of needing a separate original/render code path.
  //   idle    — unchanged item, nothing staged for it
  //   queued  — a change IS staged for it, but not in the currently displayed image
  //   placed  — the change IS in the currently displayed image (render only)
  // Swaps use the detected object's own box_2d (real position). Pinned adds use a small box
  // synthesized around the tap-to-place pin — an add with no pin gets no hotspot at all and
  // shows only in "Shop this look".
  const stateFor = (e: RestyleEdit): "placed" | "queued" | null => {
    if (shownProductIds ? shownProductIds.has(e.id) : e.active) return "placed";
    if (e.active) return "queued";
    return null;
  };
  const canvasHotspots: CanvasHotspot[] = [];
  for (const o of objects ?? []) {
    const labelKey = o.label.toLowerCase();
    const candidates = edits.filter((e) =>
      (e.kind === "item" || e.kind === "remove") && e.target_label?.toLowerCase() === labelKey,
    );
    let chosen: RestyleEdit | null = null;
    let state: "idle" | "queued" | "placed" = "idle";
    for (const c of candidates) {
      const s = stateFor(c);
      if (s === "placed") { chosen = c; state = "placed"; break; }
      if (s === "queued" && !chosen) { chosen = c; state = "queued"; }
    }
    // A placed remove means the item is actually gone from the pictured room — a hotspot on
    // empty floor is confusing, so it surfaces only in the "Removed" section (removedEdits).
    if (chosen?.kind === "remove" && state === "placed") continue;
    canvasHotspots.push({ label: o.label, box_2d: o.box_2d, state, edit: chosen });
  }
  for (const e of edits) {
    if (e.kind !== "add" || !e.placement || !e.target_label) continue;
    const s = stateFor(e);
    if (!s) continue; // inactive and never rendered — nothing to show
    const box: DetectedObject["box_2d"] = [
      Math.max(0, e.placement.y - 40), Math.max(0, e.placement.x - 40),
      Math.min(1000, e.placement.y + 40), Math.min(1000, e.placement.x + 40),
    ];
    canvasHotspots.push({ label: e.target_label, box_2d: box, state: s, edit: e });
  }

  // Estimated seconds for a generate — used by the self-ticking ProgressOverlay (it derives %
  // and "~Xs left" from generatingStartedAt + this value; it is a time-based ESTIMATE, since
  // Gemini's generateContent call has no streaming/progress signal). Scales gently with how
  // much work this render is doing.
  const expectedSeconds = Math.min(90, Math.max(30, 30 + 8 * activeEdits.length));

  return {
    id, restyle, renders, objects: objects ?? [], customItems: restyle?.custom_items ?? [], detecting, loading,
    busy, generating, generatingStartedAt, expectedSeconds, error, setError,
    titleDraft, setTitleDraft, saveTitle,
    sourcing, openSourcing, openSimilar, closeSourcing,
    pinRequest, requestPin, cancelPin, setPlacement,
    searches, runVisualSearchByUrl, runTextSearch, pickCandidate, pickingKey,
    stagePhoto, stageProductLink, stagingLink, stageRemove,
    // preview
    previewUrl, setPreviewUrl,
    // handlers
    addEdit, toggle, toggleAndRegenerate, deactivateAll, remove, addCustomItem, removeCustomItem, generate, emptyRoom, downloadImage,
    // derived
    edits, activeEdits, stagedItems, displayUrl, viewingOriginal, showSlider, canGenerate, atMaxCustom, productEdits, inspoEdits, removedEdits,
    canvasHotspots,
  };
}

export type RestyleWorkspace = ReturnType<typeof useRestyleWorkspace>;
