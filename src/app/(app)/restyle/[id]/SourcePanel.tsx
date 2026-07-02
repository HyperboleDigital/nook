"use client";

import { useState, useRef, useEffect } from "react";
import { Check } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import type { ShoppingResult } from "@/lib/shopping-search";
import { downscaleImage } from "@/lib/image-client";
import { Button, Input, ProductCard, SegmentedTabs, SkeletonProductCard, Spinner, StatusBanner, matchWord } from "./ui";

type SrcMode = "link" | "photo" | "describe";

/** Sourcing UI shown inside the Sheet for whichever item ws.sourcing points at. */
export default function SourcePanel({ ws }: { ws: RestyleWorkspace }) {
  const sourcing = ws.sourcing;
  const [srcMode, setSrcMode] = useState<SrcMode>("link");
  const [productUrl, setProductUrl] = useState("");
  const [descText, setDescText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset local sourcing UI whenever the target item changes.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setSrcMode("link"); setProductUrl(""); setDescText("");
      setPendingFile(null);
      setPendingPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    });
    return () => { active = false; };
  }, [sourcing?.label, sourcing?.mode]);

  if (!sourcing) return null;
  const label = sourcing.label;
  const search = ws.searches[label.toLowerCase()] ?? { status: "idle" as const, scored: false, results: [] };

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
  const tabs = sourcing.mode === "add"
    ? [{ value: "link" as const, label: "Paste a link" }, { value: "photo" as const, label: "Upload a photo" }]
    : [{ value: "link" as const, label: "Paste a link" }, { value: "photo" as const, label: "Upload a photo" }, { value: "describe" as const, label: "Describe it" }];

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium capitalize">
        {sourcing.mode === "swap" ? `Replacing the ${label}` : label ? `Adding ${label}` : "Adding a new piece"}
      </p>

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
        <div className="border border-[var(--border)] bg-white p-4 space-y-2">
          <p className="text-[11px] text-[var(--muted-foreground)]">Preferred — paste a Wayfair, Amazon, Walmart or Home Depot product link.</p>
          <div className="flex gap-2">
            <Input type="url" value={productUrl} onChange={(e) => setProductUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && productUrl.trim()) ws.stageProductLink(productUrl, label); }}
              placeholder="https://www.wayfair.com/…" />
            <Button disabled={ws.stagingLink || !productUrl.trim()} onClick={() => ws.stageProductLink(productUrl, label)} className="shrink-0">
              {ws.stagingLink ? <Spinner size="sm" className="text-current" /> : "Fetch"}
            </Button>
          </div>
          <button type="button" onClick={() => setSrcMode("photo")}
            className="text-[11px] text-[var(--muted-foreground)] underline hover:text-[var(--foreground)] transition-colors">
            Can&apos;t find a link? Upload a photo instead →
          </button>
        </div>
      )}

      {srcMode === "photo" && (
        <div className="border border-[var(--border)] bg-white p-4 space-y-2.5"
          onPaste={(e) => { const f = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")); if (f) pickPending(f); }}>
          <p className="text-[11px] text-[var(--muted-foreground)]">Upload a photo or screenshot for inspiration — we&apos;ll place it in your room. Buyable options are found for you after you generate.</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPending(f); e.target.value = ""; }} />

          {pendingFile && !ws.stagingLink ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingPreview ?? ""} alt="Selected" className="w-full max-h-44 object-contain border border-[var(--border)] bg-[var(--muted)]" />
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" onClick={confirmPending}>Use this photo</Button>
                <Button variant="outline" onClick={() => { setPendingFile(null); fileRef.current?.click(); }}>Choose different</Button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={ws.stagingLink} onClick={() => fileRef.current?.click()}
              className="w-full border border-dashed border-[var(--border)] py-3 text-xs text-[var(--muted-foreground)] hover:border-[var(--foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {ws.stagingLink ? <><Spinner size="sm" /> Placing it in your room…</> : "Choose or paste a photo"}
            </button>
          )}
        </div>
      )}

      {srcMode === "describe" && (
        <div className="border border-[var(--border)] bg-white p-4 space-y-2.5">
          <p className="text-[11px] text-[var(--muted-foreground)]">No link or photo? Describe it — color, material, style.</p>
          <div className="flex gap-2">
            <Input type="text" value={descText} onChange={(e) => setDescText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && descText.trim()) ws.runTextSearch(descText, label.toLowerCase()); }}
              placeholder={`e.g. a low walnut ${label} with brass legs`} />
            <Button disabled={search.status === "loading" || !descText.trim()} onClick={() => ws.runTextSearch(descText, label.toLowerCase())} className="shrink-0">
              {search.status === "loading" ? <Spinner size="sm" className="text-current" /> : "Find"}
            </Button>
          </div>
          <Button variant="outline" className="w-full" disabled={ws.busy || !descText.trim()}
            onClick={() => ws.addEdit({ kind: sourcing.mode === "swap" ? "item" : "add", targetLabel: label, instruction: descText.trim() })}>
            Just go with my description
          </Button>
        </div>
      )}
    </div>
  );
}
