"use client";

import { useEffect, useState } from "react";
import { Eraser, ExternalLink, Loader2, MapPin, Plus, Replace, ShoppingBag, TrendingDown, Wand2, X } from "lucide-react";
import { boxFromPlacement, type RailItem, type RailStatus, type RestyleWorkspace } from "./useRestyleWorkspace";
import type { RestyleEdit } from "@/types";
import { Button, ConfirmDialog, IconButton, Switch, parsePrice, shopSummary, storeName } from "./ui";
import { cn } from "@/lib/utils";
import CroppedThumb from "./CroppedThumb";

const STATUS_LABEL: Record<RailStatus, string> = {
  "in-room": "In your room",
  pending: "Pending — generate to apply",
  "turning-off": "Turning off — generate to apply",
  off: "Off",
};
const STATUS_CLS: Record<RailStatus, string> = {
  "in-room": "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  "turning-off": "bg-amber-50 text-amber-700 border border-amber-200",
  off: "bg-[var(--muted)] text-[var(--muted-foreground)]",
};

function StatusChip({ status }: { status: RailStatus }) {
  return (
    <span className={cn("inline-block rounded-full text-[10px] px-2 py-0.5 font-medium", STATUS_CLS[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

type ChangeTone = "add" | "swap" | "remove" | "refine";
// Soft-tinted rounded pill per action — shown INLINE with the "In your room" status chip, so the
// action (Added / Swapped / Removed / Adjusted) reads as its own colored pill + icon rather than a
// plain text line. The source ("from a product / your photo / a description") moved to a separate
// muted line underneath the pills (see changeSource / the ChangeCard header).
const TONE_PILL_CLS: Record<ChangeTone, string> = {
  add: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  swap: "bg-violet-50 text-violet-700 border border-violet-200",
  remove: "bg-red-50 text-red-700 border border-red-200",
  refine: "bg-amber-50 text-amber-700 border border-amber-200",
};

function changeAction(e: RestyleEdit): { verb: string; Icon: typeof Plus; tone: ChangeTone } {
  if (e.kind === "remove") return { verb: "Removed", Icon: Eraser, tone: "remove" };
  if (e.kind === "refine") return { verb: "Adjusted", Icon: Wand2, tone: "refine" };
  if (e.kind === "add") return { verb: "Added", Icon: Plus, tone: "add" };
  return { verb: "Swapped", Icon: Replace, tone: "swap" };
}

// Where the item came from — a small muted line under the pills. Products show price·retailer
// instead (that already says "a product"), and removes/refines have no source.
function changeSource(e: RestyleEdit): string | null {
  if (e.kind === "remove" || e.kind === "refine" || e.buy_url) return null;
  return e.reference_url ? "from your photo" : "from a description";
}

// The colored action pill (icon + verb), sized to sit next to the StatusChip.
function ActionPill({ e }: { e: RestyleEdit }) {
  const { verb, Icon, tone } = changeAction(e);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full text-[10px] px-2 py-0.5 font-semibold", TONE_PILL_CLS[tone])}>
      <Icon className="h-3 w-3" /> {verb}
    </span>
  );
}

// Deleting a change is permanent (unlike a switch flip, which just queues the flag change — see
// the toggle gotcha) — there's no "Turn back on" for something that's been deleted, so confirm
// first, same pattern as GenerateBar's "Empty the room". `useDeleteConfirm` gives each card its
// own dialog state (a ConfirmDialog, not window.confirm — no blocking OS dialog) and returns a
// `request(what, onConfirm)` to call from the delete button's onClick.
function useDeleteConfirm() {
  const [pending, setPending] = useState<{ what: string; onConfirm: () => void } | null>(null);
  const request = (what: string, onConfirm: () => void) => setPending({ what, onConfirm });
  const dialog = (
    <ConfirmDialog
      open={!!pending}
      onClose={() => setPending(null)}
      onConfirm={() => pending?.onConfirm()}
      title="Delete this change?"
      body={<>Delete {pending?.what}? This can&apos;t be undone.</>}
      confirmLabel="Delete"
      destructive
    />
  );
  return { request, dialog };
}

/**
 * The single, persistent rail of every change that matters right now — replaces the old
 * QueuedChanges (pre-render) / ShopLook (post-render) split. A card's identity and position
 * never change: toggling it off just flips its switch and status chip in place (see `ws.toggle`,
 * which is now flag-only — no regenerate). Whether a change is actually reflected in the CURRENT
 * image is exactly `status === "in-room"` vs anything else ("pending"/"turning-off"/"off" all mean
 * "generate to see this take effect"), so the honesty rule ("never show placed/priced UI as if
 * it's really in the room when it isn't") is satisfied by the chip text, not by hiding the card.
 */
export default function ChangesPanel({ ws }: { ws: RestyleWorkspace }) {
  const { railEdits } = ws;
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const refineItems = railEdits.filter((r) => r.edit.kind === "refine");
  const mainItems = railEdits.filter((r) => r.edit.kind !== "refine");
  const coveredLabels = new Set(mainItems.map((r) => r.edit.target_label?.toLowerCase()).filter(Boolean));
  const standaloneRefines = refineItems.filter((r) => !coveredLabels.has(r.edit.target_label?.toLowerCase()));
  const refineFor = (label?: string | null) =>
    refineItems.find((r) => r.edit.target_label?.toLowerCase() === label?.toLowerCase());

  const { total, priced: pricedCount } = shopSummary(ws.productEdits);

  const toggleEdit = async (editId: string, active: boolean) => {
    setTogglingId(editId);
    try {
      await ws.toggle(editId, active);
    } finally {
      setTogglingId(null);
    }
  };

  if (railEdits.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-3">
        <Header />
        <p className="text-xs text-[var(--muted-foreground)]">
          Nothing queued yet — tap an item to swap it, or add something new.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 space-y-3">
      <Header />
      {pricedCount > 0 && (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          {pricedCount} item{pricedCount === 1 ? "" : "s"} shoppable · from{" "}
          <span className="font-semibold text-[var(--foreground)]">
            ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </p>
      )}
      <div className="space-y-2">
        {mainItems.map((r) => (
          <ChangeCard key={r.edit.id} ws={ws} item={r} refine={refineFor(r.edit.target_label)}
            toggling={togglingId === r.edit.id} onToggle={toggleEdit} />
        ))}
        {standaloneRefines.map((r) => (
          <RefineCard key={r.edit.id} ws={ws} item={r} toggling={togglingId === r.edit.id} onToggle={toggleEdit} />
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <ShoppingBag className="h-4 w-4 text-[var(--foreground)]" />
      <p className="text-sm font-semibold">Your changes</p>
    </div>
  );
}

// Thin wrapper around ui.tsx's `Switch` — this is now a plain flag flip (no regenerate), so
// there's no "can't turn off the only change" guard anymore: batching means turning everything
// off just queues a change that Generate resolves to the bare original, same as "Start from
// original". `onDisabledClick` is left unset since there's no locked state to explain anymore.
//
// `active` is deliberately NOT applied optimistically in the hook (see `ws.toggle`'s comment) —
// that's what stops the Generate badge/status chips from flashing a wrong guess before the
// server's cache-adopt check resolves. But that means the SWITCH itself would otherwise wait
// out the whole round trip before visibly moving, which reads as laggy. `optimistic` is a
// purely-local, presentation-only override that flips the instant you click, independent of
// when `active` actually catches up — cleared as soon as the round trip ends (`!toggling`),
// which snaps it back to the real value on failure (nothing to revert, since nothing was ever
// applied) or leaves it matching on success.
function SwitchRow({
  active, toggling, onToggle,
}: { active: boolean; toggling: boolean; onToggle: () => void }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => {
    if (toggling) return;
    let active = true;
    Promise.resolve().then(() => { if (active) setOptimistic(null); });
    return () => { active = false; };
  }, [toggling]);
  const checked = optimistic ?? active;
  return (
    <Switch checked={checked} disabled={toggling}
      onChange={() => { setOptimistic(!checked); onToggle(); }}
      aria-label={checked ? "Turn off" : "Turn on"} />
  );
}

function ChangeCard({
  ws, item, refine, toggling, onToggle,
}: {
  ws: RestyleWorkspace;
  item: RailItem;
  refine?: RailItem;
  toggling: boolean;
  onToggle: (editId: string, active: boolean) => void;
}) {
  const { edit: e, status } = item;
  const label = e.target_label ?? "item";
  const isRemove = e.kind === "remove";
  const deleteConfirm = useDeleteConfirm();
  const refineDeleteConfirm = useDeleteConfirm();
  const isInspo = !isRemove && !!e.reference_url && !e.buy_url;
  const isProduct = !isRemove && !!e.buy_url;

  // Cheaper-alternatives ("dupe") signal — from the post-generate keyword search (see
  // generate/route.ts + searchCheaperByTitle). The single cheapest option that genuinely beats the
  // current price drives the "SAVE $X" thumbnail badge and the accent "See cheaper" button.
  const search = isProduct ? ws.searches[label.toLowerCase()] : undefined;
  const refPrice = isProduct && e.product_price ? parsePrice(e.product_price) : 0;
  const bestDeal = (search?.status === "ready" && refPrice > 0)
    ? search.results
        .map((r) => ({ r, p: parsePrice(r.price) }))
        .filter((x) => x.p > 0 && x.p < refPrice)
        .sort((a, b) => a.p - b.p)[0]
    : undefined;
  const savings = bestDeal ? Math.round(refPrice - bestDeal.p) : 0;
  const hasDeal = !!bestDeal && savings > 0;

  return (
    <div className="rounded-xl border border-[var(--border)] p-2.5 space-y-2">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0 h-12 w-12">
          {!isRemove && e.reference_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={e.reference_url} alt="" className="h-12 w-12 object-cover rounded-xl border border-[var(--border)] bg-[var(--muted)]" />
          ) : e.kind === "add" && e.placement ? (
            // Sourced by plain description (no reference photo) — once it's actually pictured,
            // crop the real thing out of the current photo instead of showing a generic icon.
            <CroppedThumb imageUrl={ws.displayUrl} box_2d={boxFromPlacement(e.placement)}
              className="h-12 w-12 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--muted)]" />
          ) : (
            <span className="h-12 w-12 rounded-xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)]">
              {/* A real buyable product (buy_url) always gets the shopping-bag icon, matching the
                  canvas hotspot marker's meaning — same signal, same icon, everywhere. */}
              {isRemove ? <Eraser className="h-4 w-4" />
                : isProduct ? <ShoppingBag className="h-4 w-4" />
                : e.kind === "add" ? <Plus className="h-4 w-4" />
                : <Replace className="h-4 w-4" />}
            </span>
          )}
          {/* Option C deal badge — a "SAVE $X" ribbon on the thumbnail when a genuinely cheaper
              alternative exists, so the saving is the first thing the eye lands on. */}
          {hasDeal && (
            <span className="absolute inset-x-0 bottom-0 rounded-b-xl bg-emerald-700 text-white text-[8px] leading-none font-extrabold text-center py-[3px] tracking-wide">
              SAVE ${savings}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={status} />
            <ActionPill e={e} />
          </div>
          <p className="text-sm font-medium capitalize truncate">{e.product_title ?? label}</p>
          {changeSource(e) && (
            <p className="text-xs text-[var(--muted-foreground)]">{changeSource(e)}</p>
          )}
          {isProduct && (
            <p className="text-xs text-[var(--muted-foreground)]">
              {e.product_price && <span className="font-semibold text-[var(--foreground)]">{e.product_price}</span>}
              {e.product_price && e.buy_url && " · "}
              {e.buy_url && storeName(e.buy_url)}
            </p>
          )}
          {e.kind === "add" && (
            <button type="button" onClick={() => ws.requestPin(e.id, label)}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
              <MapPin className="h-3 w-3" />
              {e.placement
                ? <>Pinned{e.placement.note ? <span className="truncate max-w-[10rem]"> — &quot;{e.placement.note}&quot;</span> : null} · <span className="underline">Move</span></>
                : "Choose a spot"}
            </button>
          )}
        </div>
        {!e.id.startsWith("optimistic-") && (
          <IconButton aria-label="Delete this change" className="h-7 w-7 shrink-0"
            onClick={() => deleteConfirm.request(isRemove ? `"Removed the ${label}"` : label, () => ws.remove(e.id))}>
            <X className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
      {deleteConfirm.dialog}

      {e.id.startsWith("optimistic-") ? (
        <p className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Confirming — this can take a minute
        </p>
      ) : (
        // Indented to line up with the text column (48px thumbnail + 12px gap = 60px). Option C's
        // deal CTA (accent, when a cheaper option exists) sits on top; the current-item "View"
        // (opens the retailer), "Try something else", and the on/off switch share the row below.
        <div className="space-y-2 pl-[60px]">
          {hasDeal && (
            <Button size="sm" variant="accent" onClick={() => ws.openSimilar(label, e.kind === "add" ? "add" : "swap", e.id)}>
              <TrendingDown className="h-3.5 w-3.5" /> See cheaper · save ${savings}
            </Button>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {isProduct && e.buy_url && (
                <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white text-xs font-medium px-3 py-1.5 hover:border-[var(--foreground)] transition-colors shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </a>
              )}
              {isProduct ? (
                <Button size="sm" variant="subtle" onClick={() => ws.openSimilar(label, e.kind === "add" ? "add" : "swap", e.id)}>
                  <Replace className="h-3.5 w-3.5" /> Try something else
                </Button>
              ) : isInspo ? (
                <Button size="sm" variant="accentSoft" onClick={() => ws.openSimilar(label, e.kind === "add" ? "add" : "swap", e.id)}>
                  <ShoppingBag className="h-3.5 w-3.5" /> Shop similar items
                </Button>
              ) : null}
            </div>
            <SwitchRow active={e.active} toggling={toggling} onToggle={() => onToggle(e.id, !e.active)} />
          </div>
        </div>
      )}

      {refine && (
        <div className="rounded-xl bg-[var(--muted)] p-2 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <Wand2 className="h-3 w-3 shrink-0 mt-0.5 text-[var(--muted-foreground)]" />
            <p className="min-w-0 flex-1 text-[11px] text-[var(--muted-foreground)] truncate">
              &quot;{refine.edit.instruction}&quot;
            </p>
            <IconButton aria-label="Delete this instruction" className="h-6 w-6 shrink-0"
              onClick={() => refineDeleteConfirm.request("this instruction", () => ws.remove(refine.edit.id))}>
              <X className="h-3 w-3" />
            </IconButton>
          </div>
          <div className="flex items-center justify-between gap-2">
            <StatusChip status={refine.status} />
            <SwitchRow active={refine.edit.active} toggling={toggling} onToggle={() => onToggle(refine.edit.id, !refine.edit.active)} />
          </div>
          {refineDeleteConfirm.dialog}
        </div>
      )}
    </div>
  );
}

function RefineCard({
  ws, item, toggling, onToggle,
}: { ws: RestyleWorkspace; item: RailItem; toggling: boolean; onToggle: (editId: string, active: boolean) => void }) {
  const e: RestyleEdit = item.edit;
  const deleteConfirm = useDeleteConfirm();
  return (
    <div className="rounded-xl border border-[var(--border)] p-2.5 space-y-2">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl bg-[var(--muted)] shrink-0 flex items-center justify-center text-[var(--muted-foreground)]">
          <Wand2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip status={item.status} />
            <ActionPill e={e} />
          </div>
          <p className="text-sm font-medium capitalize truncate">{e.target_label}</p>
          <p className="text-[11px] text-[var(--muted-foreground)] truncate">&quot;{e.instruction}&quot;</p>
        </div>
        <IconButton aria-label="Delete this instruction" className="h-7 w-7 shrink-0"
          onClick={() => deleteConfirm.request("this instruction", () => ws.remove(e.id))}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <div className="flex justify-end">
        <SwitchRow active={e.active} toggling={toggling} onToggle={() => onToggle(e.id, !e.active)} />
      </div>
      {deleteConfirm.dialog}
    </div>
  );
}
