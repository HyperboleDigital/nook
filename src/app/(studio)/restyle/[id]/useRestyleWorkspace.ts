"use client";

import { useState, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import type { DetectedObject, Restyle, RestyleEdit, RestyleRender } from "@/types";
import type { ShoppingResult } from "@/lib/shopping-search";
import type { RestyleThemeKey } from "@/lib/restyle-themes";

export type SearchState = {
  status: "idle" | "loading" | "ready" | "error";
  scored: boolean;
  results: ShoppingResult[];
  error?: string;
  // Free plan: the server returned only one match and there are more behind the paywall — the UI
  // shows a generic "upgrade to see more options" card (see SimilarItemsPanel). Plan-derived at
  // response time, so an upgrade ungates on the next search/reload. Absent/false = nothing gated.
  locked?: boolean;
};

export type Sourcing = {
  label: string;           // "" until the AI identifies an unlabeled "add" item
  mode: "swap" | "add";
  // "menu" = the category picker for an EXISTING detected item ("Edit the sofa" — Swap it /
  //   Find similar items / Adjust it / Remove it) — the entry point whenever mode is "swap".
  // "compose" = the link/photo/describe sourcing form — for an empty "add" slot from scratch
  //   (no menu, sourcing IS the only action), or reached from the menu's "Swap it".
  // "adjust" = the free-text "keep it, just reposition/reorient it" form, reached from the menu.
  // "similar" = a clean product-card list for an already-placed item (find an alternative) —
  //   reached from the menu OR directly from ShopLook/QueuedChanges cards.
  view: "menu" | "compose" | "adjust" | "similar";
  stagedEditId: string | null;
  // Did this session start at the category menu ("Edit the X")? True when an existing item was
  // tapped (openSourcing); false for a fresh "+ Add" or a direct-from-rail "Find similar", where
  // there is no menu to go "back" to. Drives the "← Back" affordance in SourcePanel/SimilarItems.
  hasMenu: boolean;
  lastStaged?: { title: string; retailer: string };
} | null;

// A tappable position on whichever image is currently displayed (original or a render) — see
// the canvasHotspots derivation below for what each state means and how it's computed.
export type CanvasHotspot = {
  label: string;
  box_2d: DetectedObject["box_2d"];
  state: "idle" | "confirming" | "queued" | "placed";
  edit: RestyleEdit | null;
};

// One card in the unified changes rail (see `railEdits`). Status is derived from
// (active, inRender) — see the derivation below for exactly what each means.
export type RailStatus = "in-room" | "pending" | "turning-off" | "off";
export type RailItem = { edit: RestyleEdit; status: RailStatus };

// A fetch used to hang for the full length of a slow/failing Unwrangle or SerpApi call (up to
// the route's own maxDuration) with the optimistic edit sitting there the whole time and NO
// visible feedback once the sourcing panel had already closed — from the user's seat, Generate
// just looked permanently disabled. Every optimistic-staging fetch is now capped client-side so
// a stuck request fails fast (and rolls back) instead of blocking indefinitely.
const STAGE_TIMEOUT_MS = 45_000;

const EMPTY_SEARCH: SearchState = { status: "idle", scored: false, results: [] };
const OPTIMISTIC_PREFIX = "optimistic-";

// A box_2d around an "add" edit's placement point — `w`/`h` (half-extents) come from an
// auto-located item's ACTUAL detected size (see the generate route's locateItemInRoom step); a
// manual tap-to-place pin has neither, so falls back to a generic small box around the point.
// Exported so ChangesPanel/SourcePanel can crop the same region out of the current photo for a
// preview thumbnail, matching what the canvas hotspot itself covers.
export function boxFromPlacement(placement: NonNullable<RestyleEdit["placement"]>): DetectedObject["box_2d"] {
  const halfW = placement.w ?? 40;
  const halfH = placement.h ?? 40;
  return [
    Math.max(0, placement.y - halfH), Math.max(0, placement.x - halfW),
    Math.min(1000, placement.y + halfH), Math.min(1000, placement.x + halfW),
  ];
}

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

  // Tap-to-place pin. `editId: string` = the classic post-hoc offer, shown right after an "add"
  // edit stages successfully (used when the user skipped the upfront location step below).
  // `editId: null` = the NEW upfront flow: capturing a location for an add that doesn't exist
  // yet (see startAddFlow) — captured into `pendingAddPlacement` and attached to the edit the
  // moment it's created, instead of prompting again after the fact. Either way, it's optional:
  // Skip/cancel leaves placement null and generate is never blocked on it.
  const [pinRequest, setPinRequest] = useState<{ editId: string | null; label: string } | null>(null);
  // A location captured BEFORE the item has been sourced (see startAddFlow/placeAddLocation) —
  // attached to the edit at staging time in stagePhoto/stageProductLink/pickCandidate below,
  // then cleared. Null if the user skipped the location step or hasn't reached it yet.
  const [pendingAddPlacement, setPendingAddPlacement] = useState<{ x: number; y: number; note?: string | null } | null>(null);

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
                hydrated[row.label] = { status: "ready", scored: row.scored, results: row.results ?? [], locked: !!row.locked };
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
          hydrated[row.label] = { status: "ready", scored: row.scored, results: row.results ?? [], locked: !!row.locked };
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

  // `currentUrl` is set whenever the server found (or the edit-state change resulted in) an
  // ALREADY-cached render for the exact resulting active-edit combination — see the edits API's
  // `adoptCachedRenderIfKnown`. Applying it here means a toggle/delete/stage that happens to land
  // back on a combination we've rendered before updates the photo INSTANTLY, no Generate click
  // needed; a genuinely new combination just leaves `current_url` untouched (the status chips /
  // `pendingCount` already tell the user they need to hit Generate for that one).
  const updateEdits = (edits: RestyleEdit[], currentUrl?: string) =>
    setRestyle((prev) => prev ? { ...prev, edits, ...(currentUrl ? { current_url: currentUrl } : {}) } : prev);

  // ── Sourcing panel open/close ──
  // Tapping ANY existing item on the canvas (whether it's been changed yet or not) opens the
  // category menu first ("Edit the sofa" — Swap it / Find similar items / Adjust it / Remove
  // it); the individual actions are destinations reached FROM the menu (see setSourcingView).
  // `stagedEditId` is the edit currently on that item, if any, so Swap/Similar supersede it
  // rather than stack a second one. A fresh "+ Add" does NOT come through here (it uses
  // placeAddLocation/skipAddLocation → view "compose", hasMenu false) since a not-yet-placed
  // item has nothing to categorize — sourcing is the only thing you can do to it.
  const openSourcing = (label: string, mode: "swap" | "add", stagedEditId: string | null = null) =>
    setSourcing({ label, mode, view: "menu", stagedEditId, hasMenu: true });
  // Similar: a clean product-card list for an item that already has something placed — reached
  // straight from a ShopLook/QueuedChanges card (hasMenu false; the panel's X closes it). The
  // menu's own "Find similar" row uses setSourcingView("similar") instead, keeping hasMenu true.
  const openSimilar = (label: string, mode: "swap" | "add", stagedEditId: string | null) =>
    setSourcing({ label, mode, view: "similar", stagedEditId, hasMenu: false });
  // Navigate within an already-open sourcing session (menu ↔ compose/adjust) without losing
  // label/mode/stagedEditId — used for the "Swap it"/"Adjust it" menu rows and their Back links.
  const setSourcingView = (view: NonNullable<Sourcing>["view"]) => setSourcing((s) => (s ? { ...s, view } : s));
  const closeSourcing = () => { setSourcing(null); setPendingAddPlacement(null); };

  // Start the "+ Add" flow: location FIRST (a pin on whatever's on screen — the CURRENT render,
  // not the bare original), then what it is, then how to source it. `pinRequest.editId: null`
  // signals "no edit exists yet" to RestyleCanvas/PinPlacementLayer.
  const startAddFlow = () => {
    setSourcing(null);
    setPendingAddPlacement(null);
    setPinRequest({ editId: null, label: "" });
  };
  // Location chosen — remember it locally (nothing to attach it TO yet) and move on to "what is
  // it" (SourcePanel shows that step first whenever mode is "add" and the label is still empty).
  const placeAddLocation = (x: number, y: number, note?: string | null) => {
    setPendingAddPlacement({ x, y, note: note ?? null });
    setPinRequest(null);
    setSourcing({ label: "", mode: "add", view: "compose", stagedEditId: null, hasMenu: false });
  };
  // Location skipped — proceed anyway; the classic post-hoc pin offer (requestPin) still fires
  // after staging in case they change their mind.
  const skipAddLocation = () => {
    setPendingAddPlacement(null);
    setPinRequest(null);
    setSourcing({ label: "", mode: "add", view: "compose", stagedEditId: null, hasMenu: false });
  };
  // The "what is it" step confirms into sourcing.label so the existing staging calls (which all
  // read the label from here) pick it up automatically.
  const setSourcingLabel = (label: string) => setSourcing((s) => (s ? { ...s, label } : s));

  // Offer to pin an add edit's location — closes any open sourcing panel so the pin layer has
  // the canvas to itself (pins are captured over the current image, in the same 0–1000 space as
  // detected_objects). This is the FALLBACK path now — used only when the upfront location step
  // was skipped, so the user still gets one more chance right after the item actually stages.
  const requestPin = (editId: string, label: string) => {
    setSourcing(null);
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
      if (r.ok) updateEdits(data.edits, data.current_url);
    } catch { /* best effort — optimistic is already set */ }
  };

  // Called once a fresh "add" edit exists on the server: if the user chose a location UP FRONT
  // (startAddFlow/placeAddLocation), attach it now and skip the old post-hoc prompt entirely;
  // otherwise fall back to offering the pin after the fact, same as before that flow existed.
  const finalizeAddPlacement = (edit: { id: string; target_label?: string | null; placement?: RestyleEdit["placement"] }) => {
    // Already placed — e.g. a "replace" that inherited the prior edit's spot (see the product
    // route). Don't re-prompt for a pin; the item keeps its location (the user can still Move it).
    if (edit.placement) return;
    if (pendingAddPlacement) {
      const placement = pendingAddPlacement;
      setPendingAddPlacement(null);
      setPlacement(edit.id, placement);
    } else {
      requestPin(edit.id, edit.target_label ?? "");
    }
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
      updateEdits(data.edits, data.current_url);
      // The route always appends the new row last (position = the old edit count) — the newly
      // inserted edit is reliably the final element of the ordered list it returns.
      const created = (data.edits as RestyleEdit[]).at(-1);
      if (created?.kind === "add") finalizeAddPlacement(created);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const setSearchState = (label: string, patch: Partial<SearchState> | ((prev: SearchState) => SearchState)) =>
    setSearches((prev) => ({
      ...prev,
      [label]: typeof patch === "function" ? patch(prev[label] ?? EMPTY_SEARCH) : { ...(prev[label] ?? EMPTY_SEARCH), ...patch },
    }));

  // Poll the persisted search row until Gemini scoring + Wayfair token resolution land
  // (the response we already applied is unscored so the user isn't staring at nothing). If
  // nothing ever shows up (e.g. the auto-triggered "dupe finder" search on a pasted link found
  // no matches at all, so `searchProductByImageUrl` never even wrote a row — see product/
  // route.ts), fall back to an empty "ready" state instead of leaving the caller's UI stuck on
  // a spinner forever once the retries run out.
  const pollScored = useCallback(async (label: string) => {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const r = await fetch(`/api/restyle/${id}/searches?label=${encodeURIComponent(label)}`);
        if (!r.ok) continue;
        const data = await r.json();
        const row = data.searches?.[0];
        if (row?.scored) { setSearchState(label, { status: "ready", scored: true, results: row.results ?? [], locked: !!row.locked }); return; }
      } catch { /* keep polling */ }
    }
    setSearchState(label, (prev) => (prev.status === "loading" ? { status: "ready", scored: true, results: [] } : prev));
  }, [id]);

  // Search using a photo that's ALREADY staged (its reference_url) rather than a fresh
  // upload — used after generate to look up buyable options for inspo-only items that made
  // it into the render, without re-cropping/re-hosting an image we already have. `box2d`
  // additionally lets this search directly off the ORIGINAL room photo cropped to a detected
  // object's own box — used for "find similar" on an item that's never been touched at all
  // (see SimilarItemsPanel), so "similar items" isn't gated behind swapping something first.
  const runVisualSearchByUrl = async (imageUrl: string, label: string, box2d?: DetectedObject["box_2d"]) => {
    setSearchState(label, { status: "loading", scored: false });
    const fd = new FormData();
    fd.append("imageUrl", imageUrl); fd.append("label", label);
    if (box2d) fd.append("box2d", JSON.stringify(box2d));
    try {
      const r = await fetch(`/api/restyle/${id}/visual-search`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't search for that item");
      setSearchState(label, { status: "ready", scored: !!data.scored, results: data.results ?? [], locked: !!data.locked });
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
      setSearchState(label, { status: "ready", scored: !!data.scored, results: data.results ?? [], locked: !!data.locked });
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
        signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't fetch that product");
      updateEdits(data.edits, data.current_url);
      setSourcing((s) => s && s.label === label
        ? { ...s, stagedEditId: data.added.id, lastStaged: { title: data.added.target_label, retailer: data.added.retailer } }
        : s);
      // stageEdit may reclassify a would-be add into a swap when the label matches a
      // detected object — only offer a pin for a genuine, still-unplaced add.
      if (data.added.kind === "add") finalizeAddPlacement(data.added);
      // No automatic cheaper-alternatives search here anymore — searching for alternatives is
      // now always user-initiated (tap "Shop similar items" / "Replace"), never fired off the
      // moment a product is staged. Staging a link just stages it.
    } catch (err) {
      setError(err instanceof DOMException && err.name === "TimeoutError" ? "That took too long — the product service may be unavailable. Try again." : err instanceof Error ? err.message : "Couldn't fetch that product");
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
        signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't add that photo");
      updateEdits(data.edits, data.current_url);
      // Keep the panel open with a success banner, same as the link/pick paths — a photo upload
      // used to close the panel silently, leaving no confirmation of what just happened. Empty
      // `retailer` (not a real store) routes SourcePanel's banner to the plain "Swapping/Adding
      // X" copy rather than the "switched from a retailer" phrasing meant for a real pick.
      setSourcing((s) => s && s.label === label
        ? { ...s, stagedEditId: data.added.id, lastStaged: { title: data.added.target_label, retailer: "" } }
        : s);
      if (data.added.kind === "add") finalizeAddPlacement(data.added);
    } catch (err) {
      updateEdits(prevEdits); // roll back the optimistic edit
      setError(err instanceof DOMException && err.name === "TimeoutError" ? "That took too long — the product service may be unavailable. Try again." : err instanceof Error ? err.message : "Couldn't add that photo");
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
        signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't fetch that product");
      updateEdits(data.edits, data.current_url);
      setSourcing((s) => s && s.label === label
        ? { ...s, stagedEditId: data.added.id, lastStaged: { title: data.added.target_label, retailer: data.added.retailer } }
        : s);
      if (data.added.kind === "add") finalizeAddPlacement(data.added);
    } catch (err) {
      updateEdits(prevEdits); // roll back the optimistic edit
      setError(err instanceof DOMException && err.name === "TimeoutError" ? "That took too long — the product service may be unavailable. Try again." : err instanceof Error ? err.message : "Couldn't fetch that product");
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
  const generate = async (body?: { toggle?: { editId: string; active: boolean }; emptyRoom?: boolean; stageRoom?: { theme: RestyleThemeKey } }) => {
    setError(null); setPinRequest(null);
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

  // "Stage this room" — server deactivates everything else and ensures both a whole-room
  // "remove" edit AND a whole-room "style" edit (the picked theme's furnish instruction) are
  // active, then renders both together in one call (see the generate route's `stageRoom`
  // handling). Mirrors emptyRoom's one-liner shape.
  const stageRoom = (theme: RestyleThemeKey) => generate({ stageRoom: { theme } });

  // A batch on/off switch — flips the flag (optimistically, for instant card/hotspot feedback)
  // and PATCHes it. It does NOT trigger a Gemini render — but if the resulting active-edit
  // combination has ALREADY been rendered before (e.g. toggling something off then back on
  // lands back on a signature we've seen), the server adopts that cached image as `current_url`
  // instantly (see `adoptCachedRenderIfKnown`), so the photo updates for free with no Generate
  // click needed. A genuinely new combination just leaves `current_url` untouched — the status
  // chips / `pendingCount` already tell the user they need to hit Generate for that one. This
  // replaced an earlier `toggleAndRegenerate` that fired a full render per flip regardless of
  // whether one was actually needed, and bounced the card between two separate rail sections.
  // Deliberately NOT optimistic on `edits`/`active` (unlike almost everything else in this
  // hook) — an immediate local flip would make `pendingCount`/status chips briefly compute
  // against the guessed new active set BEFORE the server's cache-adopt check runs, flashing a
  // "Generate 1" badge that vanishes a moment later once a cache hit resolves. Applying `edits`
  // and `current_url` together, only once the response lands, means the badge/chips jump
  // straight from correct-before to correct-after with no wrong-guess frame in between. The
  // switch itself still feels instant — `ChangesPanel`'s `SwitchRow` keeps its own local
  // override for that, independent of this round trip.
  const toggle = async (editId: string, active: boolean) => {
    try {
      const r = await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editId, active }),
      });
      const data = await r.json();
      if (r.ok) updateEdits(data.edits, data.current_url);
    } catch { /* best effort */ }
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
      if (r.ok) updateEdits(data.edits, data.current_url);
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
      updateEdits(data.edits, data.current_url);
      setSourcing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that item");
    }
  };

  // A free-text adjustment to an item ALREADY in the room — "mount it on the wall", "move it a
  // bit to the left" — rather than sourcing a replacement product. Server-side dedupe (see
  // edits/route.ts) replaces any previous refine instruction for the same label instead of
  // stacking them, so a second "move it right" cleanly supersedes an earlier "move it left".
  const stageRefine = async (label: string, instruction: string) => {
    if (!instruction.trim()) return;
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", "refine"); fd.append("targetLabel", label); fd.append("instruction", instruction.trim());
      const r = await fetch(`/api/restyle/${id}/edits`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't apply that instruction");
      updateEdits(data.edits, data.current_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply that instruction");
    }
  };

  const remove = async (editId: string) => {
    setBusy(true);
    setPinRequest((p) => (p?.editId === editId ? null : p));
    try {
      const r = await fetch(`/api/restyle/${id}/edits?editId=${editId}`, { method: "DELETE" });
      const data = await r.json();
      if (r.ok) updateEdits(data.edits, data.current_url);
    } catch { /* best effort */ }
    finally { setBusy(false); }
  };

  // "Tried before" history for a slot: every product/photo the user staged for this label that
  // ISN'T the current active pick — kept around now that a replace deactivates the old edit
  // instead of deleting it (see product/route.ts). Deduped by product/photo so bouncing between
  // the same two options doesn't stack duplicates; most-recent first.
  const historyFor = (label: string): RestyleEdit[] => {
    const key = label.toLowerCase();
    const candidates = (restyle?.edits ?? []).filter(
      (e) => (e.kind === "item" || e.kind === "add") && !e.active
        && e.target_label?.toLowerCase() === key && (e.reference_url || e.buy_url),
    );
    const seen = new Set<string>();
    const out: RestyleEdit[] = [];
    for (const e of [...candidates].sort((a, b) => b.position - a.position)) {
      const k = e.buy_url || e.reference_url || e.id;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    return out;
  };

  // Restore a prior "tried before" pick: re-activate that edit and deactivate whatever's currently
  // active on the same slot, in one batch PATCH (single-active-per-label). No new edit is created,
  // so it doesn't add another history entry; adoptCachedRenderIfKnown swaps the image instantly if
  // that combination was rendered before (a prior try usually was), else it just goes pending.
  const restoreEdit = async (edit: RestyleEdit) => {
    const key = edit.target_label?.toLowerCase();
    const prev = restyle?.edits ?? [];
    const states: Record<string, boolean> = { [edit.id]: true };
    for (const e of prev) {
      if (e.id === edit.id) continue;
      if (e.active && (e.kind === "item" || e.kind === "add" || e.kind === "remove")
        && e.target_label?.toLowerCase() === key) states[e.id] = false;
    }
    updateEdits(prev.map((e) => (e.id in states ? { ...e, active: states[e.id] } : e)));
    setSourcing((s) => (s && s.label.toLowerCase() === key ? { ...s, stagedEditId: edit.id } : s));
    try {
      const r = await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ states }),
      });
      const data = await r.json();
      if (r.ok) updateEdits(data.edits, data.current_url);
    } catch { /* optimistic already applied */ }
  };

  // Jump back to a previously-generated version (see VersionsGallery): set the active-edit set to
  // exactly that render's signature — activate its edits, deactivate the rest — so the room shows
  // that whole combination again. The image is already cached, so the batch PATCH's
  // adoptCachedRenderIfKnown swaps current_url to it with no re-render. (A render whose signature
  // references a since-deleted edit can't be reproduced exactly; everything still present is
  // matched, and the server's current_url reflects the honest result.)
  const restoreRender = async (render: RestyleRender) => {
    const sigIds = new Set(render.signature.split(",").filter(Boolean));
    const prev = restyle?.edits ?? [];
    const states: Record<string, boolean> = {};
    for (const e of prev) {
      const shouldBeActive = sigIds.has(e.id);
      if (e.active !== shouldBeActive) states[e.id] = shouldBeActive;
    }
    setRestyle((r) => (r ? {
      ...r, current_url: render.image_url,
      edits: prev.map((e) => (e.id in states ? { ...e, active: states[e.id] } : e)),
    } : r));
    if (Object.keys(states).length === 0) return; // already this exact combination
    try {
      const res = await fetch(`/api/restyle/${id}/edits`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ states }),
      });
      const data = await res.json();
      if (res.ok) updateEdits(data.edits, data.current_url || render.image_url);
    } catch { /* optimistic already applied */ }
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

  // Simple, phone-friendly save. On iOS the classic `<a download>` just opens the image in a new
  // tab (it can't write to Photos), so we prefer the native share/save sheet when the platform can
  // share a file — that's the only real "save to your phone" from mobile Safari. Desktop/Android
  // keep the download link. A `downloadToast` drives the little "Downloading full size…" pill.
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const downloadImage = async () => {
    const url = restyle?.current_url; // always the active generation — one image, no version nav
    if (!url) return;
    setDownloadToast("Downloading full size…");
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `nook-restyle-${id}.png`, { type: blob.type || "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (err) {
          // Cancelling the share sheet is not an error — just stop quietly.
          if (!(err instanceof DOMException) || err.name !== "AbortError") throw err;
        }
        setDownloadToast(null);
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: blobUrl, download: file.name });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(blobUrl);
      setDownloadToast(null); // the browser's own download UI is the confirmation on desktop
    } catch {
      window.open(url, "_blank");
      setDownloadToast(null);
    }
  };

  // ── Derived ──
  const loading = !restyle || objects === null;
  const edits = restyle?.edits ?? [];
  const activeEdits = edits.filter((e) => e.active);
  const stagedItems = activeEdits.filter((e) =>
    e.kind === "item" || e.kind === "add" || (e.kind === "remove" && e.target_label) || (e.kind === "refine" && e.target_label),
  );
  // ONE image: always the current generation. There's no version navigation / "viewing the
  // original" state anymore — the original + past renders are pure backend machinery (recompose
  // composites from the original; `restyle_renders` caches per-signature for instant toggle).
  // `viewingOriginal` is therefore true only in the pristine pre-first-generate state, where
  // `current_url` literally IS `original_url` (nothing has been rendered yet) — which still
  // correctly gates the "never show placed/priced UI before anything's generated" rule.
  const displayUrl = restyle?.current_url ?? "";
  const viewingOriginal = !!restyle && displayUrl === restyle.original_url;
  const confirmingCount = activeEdits.filter((e) => e.id.startsWith(OPTIMISTIC_PREFIX)).length;
  const hasOptimistic = confirmingCount > 0;
  const atMaxCustom = (restyle?.custom_items?.length ?? 0) >= 5;

  // What's actually in the image currently on screen — the render's signature IS the set of
  // active-edit ids it was composed from (see restyle-render.ts), so this doubles as both "is
  // this edit visible right now" (below) and the input to the pending-changes diff.
  const displayedRender = renders.find((r) => r.image_url === displayUrl);
  const shownProductIds: Set<string> | null =
    viewingOriginal ? new Set()
    : displayedRender ? new Set(displayedRender.signature.split(","))
    : null;
  const inShown = (e: RestyleEdit) => (shownProductIds ? shownProductIds.has(e.id) : e.active);

  // How many changes wouldn't be reflected if the user looked at the current image right now —
  // the symmetric diff between what's active and what's actually rendered. Replaces the old
  // "just count active edits" badge, which stayed nonzero forever once anything was staged
  // (edits don't deactivate themselves after a successful render).
  const pendingCount = (() => {
    if (shownProductIds === null) return 0;
    const activeIds = new Set(activeEdits.filter((e) => !e.id.startsWith(OPTIMISTIC_PREFIX)).map((e) => e.id));
    const byId = new Map(edits.map((e) => [e.id, e] as const));
    const activeLabels = new Set(
      activeEdits.filter((e) => e.target_label).map((e) => e.target_label!.toLowerCase()),
    );
    let diff = 0;
    for (const eid of activeIds) if (!shownProductIds.has(eid)) diff++;
    let staleUncounted = false;
    for (const eid of shownProductIds) {
      if (activeIds.has(eid)) continue;
      const e = byId.get(eid);
      if (e) {
        // Superseded by a newer active edit on the same slot (a replace, or restoring a prior
        // "tried before" pick — the old attempt is kept as inactive history now, not deleted).
        // That active edit is already counted above, so counting this one too would make a single
        // swap read as 2 pending changes. A genuinely toggled-off edit (nothing active on its
        // label) still counts as a pending removal.
        if (e.target_label && activeLabels.has(e.target_label.toLowerCase())) continue;
        diff++;
      } else {
        staleUncounted = true;   // fully deleted id still in the render (rare now)
      }
    }
    if (staleUncounted && diff === 0) diff = 1;
    return diff;
  })();
  const canGenerate = pendingCount > 0 && !hasOptimistic;

  // The unified changes rail (ChangesPanel): one persistent card per relevant edit, whether it's
  // currently in the room, staged but not yet generated, switched off but still in the room (a
  // pending regenerate will remove it), or switched off and already out of the room. Toggling in
  // ChangesPanel only ever flips `active` (see `toggle`) — it never moves an edit between lists,
  // so a card never jumps around; only its status/switch changes until the next Generate.
  const RAIL_KINDS = new Set(["item", "add", "refine", "remove"]);
  const activeRelevant = activeEdits.filter((e) => RAIL_KINDS.has(e.kind) && e.target_label);
  const labelsWithActive = new Set(
    activeRelevant.map((e) => e.target_label!.toLowerCase()),
  );
  // Edits switched off whose label has no active edit — i.e. genuinely toggled off by the user,
  // not superseded by a newer active change on the same label (couch A→B leaves A inactive, but
  // that's history, not something to re-offer). Deduped to the most recent per label.
  const offByLabel = new Map<string, RestyleEdit>();
  for (const e of edits) {
    if (e.active || !RAIL_KINDS.has(e.kind) || !e.target_label) continue;
    const key = e.target_label.toLowerCase();
    if (labelsWithActive.has(key)) continue;
    const cur = offByLabel.get(key);
    if (!cur || e.position > cur.position) offByLabel.set(key, e);
  }
  const railEdits: RailItem[] = [
    ...activeRelevant.map((e) => ({ edit: e, status: (inShown(e) ? "in-room" : "pending") as RailStatus })),
    ...[...offByLabel.values()].map((e) => ({ edit: e, status: (inShown(e) ? "turning-off" : "off") as RailStatus })),
  ];

  // In-room, buyable product edits — feeds the canvas's floating shop-summary pill.
  const productEdits = railEdits.filter((r) => r.status === "in-room" && r.edit.buy_url).map((r) => r.edit);

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
  // "confirming" is a distinct, prior state to "queued": the edit is only a client-side
  // optimistic placeholder still round-tripping to the server (a slow/degraded Unwrangle or
  // SerpApi lookup can take a while — see STAGE_TIMEOUT_MS) — it can never be "placed" (no
  // render can reference an id the server hasn't issued yet), and showing it as a plain
  // confirmed "queued" checkmark used to make Generate's disabled state look like a bug.
  const stateFor = (e: RestyleEdit): "confirming" | "placed" | "queued" | null => {
    if (e.id.startsWith(OPTIMISTIC_PREFIX) && e.active) return "confirming";
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
    let state: "idle" | "confirming" | "queued" | "placed" = "idle";
    for (const c of candidates) {
      const s = stateFor(c);
      if (s === "placed") { chosen = c; state = "placed"; break; }
      if ((s === "queued" || s === "confirming") && !chosen) { chosen = c; state = s; }
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
    const box = boxFromPlacement(e.placement);
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
    sourcing, openSourcing, openSimilar, closeSourcing, setSourcingLabel, setSourcingView,
    pinRequest, requestPin, cancelPin, setPlacement, startAddFlow, placeAddLocation, skipAddLocation,
    searches, runVisualSearchByUrl, runTextSearch, pickCandidate, pickingKey,
    stagePhoto, stageProductLink, stagingLink, stageRemove, stageRefine,
    // handlers
    addEdit, toggle, deactivateAll, remove, historyFor, restoreEdit, restoreRender, addCustomItem, removeCustomItem, generate, emptyRoom, stageRoom, downloadImage, downloadToast,
    // derived
    edits, activeEdits, stagedItems, displayUrl, viewingOriginal, canGenerate, pendingCount, confirmingCount, atMaxCustom, productEdits, railEdits,
    canvasHotspots,
  };
}

export type RestyleWorkspace = ReturnType<typeof useRestyleWorkspace>;
