"use client";

import { useState, useRef, useEffect } from "react";
import { Check, ChevronLeft, ChevronRight, Eraser, Replace, ShoppingBag, Sparkles, Wand2 } from "lucide-react";
import { boxFromPlacement, type RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { downscaleImage } from "@/lib/image-client";
import { Button, Input, ProductCard, SegmentedTabs, SkeletonProductCard, Spinner, StatusBanner, matchWord } from "./ui";
import CroppedThumb from "./CroppedThumb";

type SrcMode = "link" | "photo" | "describe";

// Suggestions for the "what are you adding?" step — mirrors the vocabulary in gemini.ts's
// DETECT_PROMPT so the guided list and what detection actually recognizes stay in sync. Native
// <datalist> autocomplete: helps a user land on a clean, common item name (and nudges away from
// typing something off-topic) without forcing a rigid picker — free text is still accepted and
// goes through the same normalize-label call either way.
const COMMON_ITEMS = [
  "sofa", "sectional", "armchair", "coffee table", "side table", "console table",
  "dining table", "dining chair", "bed", "nightstand", "dresser", "bookshelf", "desk",
  "area rug", "floor lamp", "table lamp", "pendant light", "chandelier", "ceiling fan",
  "mirror", "framed art", "curtains", "plant", "ottoman", "bench",
];

/**
 * Sourcing UI shown inside the Sheet/rail for whichever item ws.sourcing points at. For an
 * EXISTING detected item (mode "swap"), this starts on a category MENU — "Edit the sofa": Swap
 * it / Find similar items / Adjust it / Remove it — rather than jumping straight into a sourcing
 * form. That reframe (an item has several things you can DO to it, sourcing a replacement is
 * just one of them) is why "Adjust it" is its own destination (`view: "adjust"`) instead of a
 * 4th tab crammed alongside Paste-link/Upload-photo/Describe-it. A fresh "add" (nothing placed
 * yet) skips the menu entirely — sourcing IS the only action, so it goes straight to `view:
 * "compose"` (see useRestyleWorkspace's openSourcing/placeAddLocation/skipAddLocation).
 */
export default function SourcePanel({ ws }: { ws: RestyleWorkspace }) {
  const sourcing = ws.sourcing;
  const [srcMode, setSrcMode] = useState<SrcMode>("link");
  const [productUrl, setProductUrl] = useState("");
  const [descText, setDescText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState("");
  const [normalizing, setNormalizing] = useState(false);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);
  const [refineText, setRefineText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset local sourcing UI whenever the target item changes.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setSrcMode("link"); setProductUrl(""); setDescText(""); setItemDraft(""); setRefineText("");
      setNormalizing(false); setNormalizeError(null);
      setPendingFile(null);
      setPendingPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    });
    return () => { active = false; };
  }, [sourcing?.label, sourcing?.mode]);

  // Seed the "Adjust it" text box from any already-active instruction for this label, ONCE per
  // visit to that view (not on every render — see the "adjust" branch below, which reads
  // `refineText` directly so it stays freely editable/clearable after this). Must live above
  // the `!sourcing` early return (hooks can't be called conditionally), so it re-derives the
  // active refine edit itself rather than reusing the `activeRefine` const computed below.
  useEffect(() => {
    if (sourcing?.view !== "adjust") return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const current = ws.edits.find((e) =>
        e.kind === "refine" && e.active && e.target_label?.toLowerCase() === sourcing.label.toLowerCase());
      setRefineText((prev) => prev || current?.instruction || "");
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcing?.view, sourcing?.label]);

  if (!sourcing) return null;
  const label = sourcing.label;

  // Free text gets turned into a short, clean label ("floor plant next to the tv, kind of tall"
  // → "Floor Plant") before it's accepted — the raw input used to become the label EVERYWHERE
  // (menu title, canvas hotspot, changes-rail card) verbatim, which read terribly once it stuck.
  // This also doubles as a content-moderation gate: normalizeItemLabel refuses non-item/
  // gibberish/offensive input, surfaced here as an error instead of silently accepting it.
  const confirmItemDraft = async () => {
    const text = itemDraft.trim();
    if (!text) return;
    setNormalizing(true); setNormalizeError(null);
    try {
      const r = await fetch("/api/restyle/normalize-label", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Couldn't recognize that item");
      ws.setSourcingLabel(data.label);
    } catch (err) {
      setNormalizeError(err instanceof Error ? err.message : "Couldn't recognize that item");
    } finally {
      setNormalizing(false);
    }
  };

  // "+ Add" flow order: location (already chosen on the canvas before this panel ever opens —
  // see startAddFlow/placeAddLocation) → what is it → how to source it. This is that middle
  // step: a fresh add always arrives here with an empty label, so gate the usual tabs behind a
  // one-line "what is it" prompt instead of jumping straight to sourcing.
  if (sourcing.mode === "add" && !label) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">What are you adding?</p>
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-2.5">
          <Input type="text" value={itemDraft} onChange={(e) => setItemDraft(e.target.value)} autoFocus
            list="restyle-common-items" disabled={normalizing}
            onKeyDown={(e) => { if (e.key === "Enter" && itemDraft.trim()) confirmItemDraft(); }}
            placeholder="e.g. floor lamp, side table, area rug" />
          <datalist id="restyle-common-items">
            {COMMON_ITEMS.map((item) => <option key={item} value={item} />)}
          </datalist>
          {normalizeError && <StatusBanner variant="error">{normalizeError}</StatusBanner>}
          <Button variant="primary" className="w-full" disabled={!itemDraft.trim() || normalizing}
            onClick={confirmItemDraft}>
            {normalizing ? <><Spinner size="sm" className="text-current" /> Checking…</> : "Continue"}
          </Button>
        </div>
      </div>
    );
  }
  const search = ws.searches[label.toLowerCase()] ?? { status: "idle" as const, scored: false, results: [] };
  // The actual item being replaced, cropped from the original photo — so "Editing the
  // ceiling fan" isn't just a label, you can see exactly which fixture it means.
  const matchedObject = sourcing.mode === "swap"
    ? ws.objects.find((o) => o.label.toLowerCase() === label.toLowerCase())
    : undefined;
  // If this item has already been swapped, the header should show the NEW staged item, not the
  // original one it replaced — otherwise "Editing the console" kept showing the old console
  // forever, since the crop was always taken from the original photo at the detected box.
  const stagedEdit = sourcing.stagedEditId ? ws.edits.find((e) => e.id === sourcing.stagedEditId) : null;
  // An already-active custom instruction for this label, if any — reopening "Adjust it" shows
  // (and lets you replace) what's currently staged rather than starting from a blank box.
  const activeRefine = ws.edits.find((e) => e.kind === "refine" && e.active && e.target_label?.toLowerCase() === label.toLowerCase());

  const pickPending = (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    setPendingPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f); });
    setPendingFile(f);
  };
  const confirmPending = async () => {
    const f = pendingFile; if (!f) return;
    setPendingFile(null);
    setPendingPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    const small = await downscaleImage(f);
    // Just stages the photo as inspo — no shopping search here. Search (and its API cost)
    // is deferred until generate, scoped to whatever inspo photos actually made it into the
    // render, surfaced in "Shop this look" instead of mid-composition.
    ws.stagePhoto(small, label.toLowerCase());
  };

  const staged = !!sourcing.lastStaged;
  const tabs = [
    { value: "link" as const, label: "Paste a link" },
    { value: "photo" as const, label: "Upload a photo" },
    { value: "describe" as const, label: "Describe it" },
  ];

  // "← Back" returns to the "Edit item" menu — shown whenever this session started there
  // (`hasMenu`), i.e. an existing item was tapped. A fresh "+ Add" (hasMenu false) has no menu.
  const canBackToMenu = sourcing.hasMenu;
  const backToMenu = () => ws.setSourcingView("menu");
  // "Remove it": for a detected item, stage a targeted remove (take the real object out of the
  // room). For a pure "add" (no detected object — a piece the user added), removing means
  // deleting the add edit itself, not staging a remove of something that was never there.
  const removeIt = () => {
    if (matchedObject) ws.stageRemove(label);
    else if (sourcing.stagedEditId) ws.remove(sourcing.stagedEditId);
    ws.closeSourcing();
  };

  const header = (
    <div className="flex items-center gap-3">
      {stagedEdit?.reference_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={stagedEdit.reference_url} alt="" className="h-14 w-14 object-cover rounded-xl border border-[var(--border)] bg-[var(--muted)] shrink-0" />
      ) : matchedObject && ws.restyle ? (
        <CroppedThumb imageUrl={ws.restyle.original_url} box_2d={matchedObject.box_2d}
          className="h-14 w-14 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--muted)] shrink-0" />
      ) : stagedEdit?.placement ? (
        // An "add" sourced by plain description (no reference photo) — once it's actually
        // pictured, crop the real thing out of the current photo instead of showing nothing.
        <CroppedThumb imageUrl={ws.displayUrl} box_2d={boxFromPlacement(stagedEdit.placement)}
          className="h-14 w-14 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--muted)] shrink-0" />
      ) : null}
      <p className="text-sm font-medium capitalize">
        {sourcing.view === "menu" ? `Editing the ${label}`
          : sourcing.view === "adjust" ? `Adjusting the ${label}`
          : sourcing.mode === "swap" ? `Replacing the ${label}`
          : label ? `Adding ${label}` : "Adding a new piece"}
      </p>
    </div>
  );

  // ── Category menu — the entry point for any existing item (changed or not) ──
  if (sourcing.view === "menu") {
    return (
      <div className="space-y-3">
        {header}
        <div className="space-y-2">
          <MenuRow icon={Sparkles} title="Swap it" subtitle="Replace with a different product" tone="swap"
            onClick={() => ws.setSourcingView("compose")} />
          <MenuRow icon={ShoppingBag} title="Shop similar items" subtitle="See buyable alternatives to what's there now" tone="shop"
            onClick={() => ws.setSourcingView("similar")} />
          <MenuRow icon={Wand2} title="Adjust it" tone="adjust"
            subtitle={activeRefine ? `"${activeRefine.instruction}"` : "Keep it, just reposition or reorient it"}
            onClick={() => ws.setSourcingView("adjust")} />
          <MenuRow icon={Eraser} title="Remove it" subtitle="Take it out of the room entirely" tone="remove"
            onClick={removeIt} />
        </div>
      </div>
    );
  }

  // ── Adjust it — a standalone destination now, not a tab ──
  if (sourcing.view === "adjust") {
    return (
      <div className="space-y-3">
        {header}
        {canBackToMenu && (
          <button type="button" onClick={backToMenu}
            className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        {ws.error && <StatusBanner variant="error">{ws.error}</StatusBanner>}
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-2.5">
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Keep the {label} as-is, just change how it&apos;s placed or oriented — e.g. &quot;mount it on the wall&quot;, &quot;move it a bit to the left&quot;, &quot;turn it to face the window&quot;.
          </p>
          <Input type="text" value={refineText} onChange={(e) => setRefineText(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && refineText.trim()) ws.stageRefine(label, refineText); }}
            placeholder={`e.g. mount the ${label} on the wall`} />
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={!refineText.trim()}
              onClick={() => ws.stageRefine(label, refineText)}>
              {activeRefine ? "Update instruction" : "Apply instruction"}
            </Button>
            {activeRefine && (
              <Button variant="outline" onClick={() => { ws.remove(activeRefine.id); setRefineText(""); }}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Compose — the link/photo/describe sourcing form (an empty "add" slot, or "Swap it" from
  //     the menu above) ──
  return (
    <div className="space-y-3">
      {header}
      {canBackToMenu && (
        <button type="button" onClick={backToMenu}
          className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
      )}

      {staged && (
        <StatusBanner variant="success" icon={<Check className="h-3.5 w-3.5" />}>
          {sourcing.lastStaged!.retailer
            ? <>Switched to <strong>{sourcing.lastStaged!.title}</strong> from {sourcing.lastStaged!.retailer} — your uploaded photo is no longer used.</>
            : <>{sourcing.mode === "swap" ? "Swapping" : "Adding"} <span className="capitalize">{sourcing.lastStaged!.title || "your new piece"}</span></>}
        </StatusBanner>
      )}
      {ws.error && <StatusBanner variant="error">{ws.error}</StatusBanner>}

      <SegmentedTabs options={tabs} value={srcMode} onChange={setSrcMode} />

      {/* Results — visible above whichever tab is active */}
      {search.status === "loading" && (
        <div className="space-y-2">
          <SkeletonProductCard /><SkeletonProductCard /><SkeletonProductCard />
        </div>
      )}
      {search.status === "error" && <StatusBanner variant="error">{search.error}</StatusBanner>}
      {search.status === "ready" && search.results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {search.scored ? `Options for ${label || "this item"}` : "Found options — ranking best matches…"}
          </p>
          {search.results.map((c, i) => {
            const key = `${label}:${i}`;
            const picking = ws.pickingKey === key;
            return (
              <ProductCard key={i}
                image={c.thumbnail} title={c.title} retailer={c.retailer} price={c.price}
                viewUrl={c.productUrl ?? c.alternates?.[0]?.url ?? null}
                badge={matchWord(c.score, c.exact)}>
                {c.alternates && c.alternates.length > 0 && (
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-tight">
                    also at{c.alternates.map((a, j) => (
                      <span key={j}>{j > 0 ? " · " : " "}
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--foreground)]">
                          {a.retailer}{a.price ? ` ${a.price}` : ""}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
                <Button size="sm" variant="primary" disabled={ws.pickingKey != null}
                  onClick={() => ws.pickCandidate(c as ShoppingResult, label, key, sourcing.stagedEditId ?? undefined)} className="mt-1">
                  {picking ? <><Spinner size="xs" className="text-current" /> Adding…</> : "Use this in the room"}
                </Button>
                {picking && (
                  <p className="text-[11px] text-[var(--muted-foreground)]">Fetching live price and details — can take up to a minute for some retailers.</p>
                )}
              </ProductCard>
            );
          })}
        </div>
      )}

      {srcMode === "link" && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-2">
          <p className="text-[11px] text-[var(--muted-foreground)]">Preferred — paste a Wayfair, Amazon, Walmart or Home Depot product link.</p>
          <div className="flex gap-2">
            <Input type="url" value={productUrl} onChange={(e) => setProductUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && productUrl.trim()) ws.stageProductLink(productUrl, label); }}
              placeholder="https://www.wayfair.com/…" />
            <Button disabled={ws.stagingLink || !productUrl.trim()} onClick={() => ws.stageProductLink(productUrl, label)} className="shrink-0">
              {ws.stagingLink ? <Spinner size="sm" className="text-current" /> : "Fetch"}
            </Button>
          </div>
          {ws.stagingLink && (
            <p className="text-[11px] text-[var(--muted-foreground)]">Fetching product details — this can take up to a minute.</p>
          )}
          <button type="button" onClick={() => setSrcMode("photo")}
            className="text-[11px] text-[var(--muted-foreground)] underline hover:text-[var(--foreground)] transition-colors">
            Can&apos;t find a link? Upload a photo instead →
          </button>
        </div>
      )}

      {srcMode === "photo" && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-2.5"
          onPaste={(e) => { const f = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")); if (f) pickPending(f); }}>
          <p className="text-[11px] text-[var(--muted-foreground)]">Upload a photo or screenshot for inspiration — we&apos;ll place it in your room. Buyable options are found for you after you generate.</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPending(f); e.target.value = ""; }} />

          {pendingFile && !ws.stagingLink ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreview ?? ""} alt="Selected" className="w-full max-h-44 object-contain rounded-xl border border-[var(--border)] bg-[var(--muted)]" />
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" onClick={confirmPending}>Use this photo</Button>
                <Button variant="outline" onClick={() => { setPendingFile(null); fileRef.current?.click(); }}>Choose different</Button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={ws.stagingLink} onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border border-dashed border-[var(--border)] py-3 text-xs text-[var(--muted-foreground)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {ws.stagingLink ? <><Spinner size="sm" /> Placing it in your room…</> : "Choose or paste a photo"}
            </button>
          )}
        </div>
      )}

      {srcMode === "describe" && (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-2.5">
          <p className="text-[11px] text-[var(--muted-foreground)]">No link or photo? Describe it — color, material, style.</p>
          <div className="flex gap-2">
            <Input type="text" value={descText} onChange={(e) => setDescText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && descText.trim()) ws.runTextSearch(descText, label.toLowerCase()); }}
              placeholder={`e.g. a low walnut ${label} with brass legs`} />
            <Button disabled={search.status === "loading" || !descText.trim()} onClick={() => ws.runTextSearch(descText, label.toLowerCase())} className="shrink-0">
              {search.status === "loading" ? <Spinner size="sm" className="text-current" /> : "Find"}
            </Button>
          </div>
          {search.status === "loading" && (
            <p className="text-[11px] text-[var(--muted-foreground)]">Searching retailers — this can take a few seconds.</p>
          )}
          <Button variant="outline" className="w-full" disabled={ws.busy || !descText.trim()}
            onClick={() => ws.addEdit({ kind: sourcing.mode === "swap" ? "item" : "add", targetLabel: label, instruction: descText.trim() })}>
            Just go with my description
          </Button>
        </div>
      )}
    </div>
  );
}

// Each row's icon badge gets its own color + a slow-shifting gradient sheen (a "fun and techy"
// touch) so the four actions read as visually distinct categories at a glance, not just a list
// of identical gray squares — "Remove it" being red was already the one exception; now all four
// are color-coded the same way.
const MENU_ROW_TONES = {
  swap: "from-violet-500 to-fuchsia-500",
  shop: "from-emerald-500 to-teal-500",
  adjust: "from-amber-400 to-orange-500",
  remove: "from-red-500 to-rose-600",
} as const;

function MenuRow({
  icon: Icon, title, subtitle, onClick, tone,
}: {
  icon: typeof Replace;
  title: string;
  subtitle: string;
  onClick: () => void;
  tone: keyof typeof MENU_ROW_TONES;
}) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 text-left hover:border-[var(--foreground)] transition-colors">
      <span
        className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center text-white bg-gradient-to-br ${MENU_ROW_TONES[tone]} bg-[length:200%_200%] animate-[icon-gradient-shift_4s_ease-in-out_infinite]`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-[var(--muted-foreground)] truncate capitalize">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
    </button>
  );
}
