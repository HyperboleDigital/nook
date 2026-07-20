"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, ChevronRight, Eraser, ExternalLink, Loader2, Plus, ShoppingBag, Wand2, X } from "lucide-react";
import { boxFromPlacement, type ChangeFilter, type RailItem, type RailStatus, type RestyleWorkspace } from "./useRestyleWorkspace";
import type { RestyleEdit } from "@/types";
import { ConfirmDialog, SegmentedTabs, Switch, shopSummary, storeName } from "./ui";
import { cn } from "@/lib/utils";
import CroppedThumb from "./CroppedThumb";

// Sort order for the Changes list: not-yet-applied changes (pending / turning-off — the ones that
// still need a Generate) float to the top; already-in-room, then off, follow. Stable within a rank.
const STATUS_ORDER: Record<RailStatus, number> = { pending: 0, "turning-off": 1, "in-room": 2, off: 3 };
// A small status dot on each compact row — colour matches the honest-labeling meaning (amber =
// needs generate, accent = actually in the room, grey = off).
const STATUS_DOT: Record<RailStatus, string> = {
  pending: "bg-amber-500", "turning-off": "bg-amber-500", "in-room": "bg-[var(--accent)]", off: "bg-[var(--border)]",
};

type ChangeTone = "add" | "swap" | "remove" | "refine";
const TONE_ICON: Record<ChangeTone, string> = {
  add: "text-emerald-600", swap: "text-violet-600", remove: "text-red-600", refine: "text-amber-600",
};

function changeAction(e: RestyleEdit): { verb: string; Icon: typeof Plus; tone: ChangeTone } {
  if (e.kind === "remove") return { verb: "Removed", Icon: Eraser, tone: "remove" };
  if (e.kind === "refine") return { verb: "Adjusted", Icon: Wand2, tone: "refine" };
  if (e.kind === "add") return { verb: "Added", Icon: Plus, tone: "add" };
  return { verb: "Swapped", Icon: ArrowLeftRight, tone: "swap" };
}

// Where the item came from — the compact row's meta line for non-product changes.
function changeSource(e: RestyleEdit): string | null {
  if (e.kind === "remove") return "removed";
  if (e.kind === "refine") return e.instruction ? `"${e.instruction}"` : "adjusted";
  if (e.buy_url) return null;
  return e.reference_url ? "from your photo" : "from a description";
}

// Deleting a change is permanent (unlike a switch flip) — confirm first. Gives each row its own
// ConfirmDialog state (not window.confirm) + a `request(what, onConfirm)`.
function useDeleteConfirm() {
  const [pending, setPending] = useState<{ what: string; onConfirm: () => void } | null>(null);
  const request = (what: string, onConfirm: () => void) => setPending({ what, onConfirm });
  const dialog = (
    <ConfirmDialog open={!!pending} onClose={() => setPending(null)} onConfirm={() => pending?.onConfirm()}
      title="Delete this change?" body={<>Delete {pending?.what}? This can&apos;t be undone.</>}
      confirmLabel="Delete" destructive />
  );
  return { request, dialog };
}

/**
 * The Changes tab is now CANVAS-FIRST: a compact list under a row of filter chips (All / Pending /
 * In room / Off). The chips also drive the canvas — a non-"all" filter (shared via
 * `ws.changeFilter`) dims the markers that don't match, so tapping a chip "lights up" only those
 * items on the photo (see ObjectHotspots). Each row is a single line — tap it to open the Edit item
 * menu (same path as tapping the item on the photo); the switch toggles in place; a never-rendered
 * ("pending") change can be deleted with the X. Detail (Shop similar, Save $X, adjust) lives in the
 * menu the row opens, not crammed onto the row. Shop tab unchanged.
 */
export default function ChangesPanel({ ws }: { ws: RestyleWorkspace }) {
  const { railEdits, productEdits, changeFilter, setChangeFilter } = ws;
  const [tab, setTab] = useState<"changes" | "shop">("changes");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const rows = railEdits.slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const counts = {
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending" || r.status === "turning-off").length,
    "in-room": rows.filter((r) => r.status === "in-room").length,
    off: rows.filter((r) => r.status === "off").length,
  };
  const inFilter = (s: RailStatus) =>
    changeFilter === "all" ? true
    : changeFilter === "pending" ? (s === "pending" || s === "turning-off")
    : changeFilter === "in-room" ? s === "in-room"
    : s === "off";
  const shown = rows.filter((r) => inFilter(r.status));

  // If the active filter empties out (e.g. every pending change just got generated), fall back to
  // "All" so the tab (and the canvas dimming) don't get stuck on an empty slice.
  const filterEmpty = changeFilter !== "all" && counts[changeFilter] === 0;
  useEffect(() => { if (filterEmpty) setChangeFilter("all"); }, [filterEmpty, setChangeFilter]);

  const toggleEdit = async (editId: string, active: boolean) => {
    setTogglingId(editId);
    try { await ws.toggle(editId, active); } finally { setTogglingId(null); }
  };

  // Nothing at all yet — no tabs, just the invitation to start.
  if (railEdits.length === 0 && productEdits.length === 0) {
    return (
      <div className="space-y-3">
        <Header />
        <p className="text-xs text-[var(--muted-foreground)]">
          Nothing queued yet — tap an item to swap it, or add something new.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SegmentedTabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "changes", label: railEdits.length ? `Changes · ${railEdits.length}` : "Changes" },
          { value: "shop", label: productEdits.length ? `Shop · ${productEdits.length}` : "Shop" },
        ]}
      />
      {tab === "changes" ? (
        railEdits.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] py-1">
            No changes yet — tap an item to swap it, or add something new.
          </p>
        ) : (
          <div className="space-y-2">
            <FilterChips counts={counts} value={changeFilter} onChange={setChangeFilter} />
            {shown.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] py-2 text-center">Nothing here.</p>
            ) : (
              <div className="space-y-1.5">
                {shown.map((r) => (
                  <CompactRow key={r.edit.id} ws={ws} item={r} toggling={togglingId === r.edit.id} onToggle={toggleEdit} />
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <ShopPane ws={ws} />
      )}
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

function FilterChips({
  counts, value, onChange,
}: { counts: Record<"all" | "pending" | "in-room" | "off", number>; value: ChangeFilter; onChange: (v: ChangeFilter) => void }) {
  const chips: { key: ChangeFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "in-room", label: "In room" },
    { key: "off", label: "Off" },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.filter((c) => c.key === "all" || counts[c.key] > 0).map((c) => {
        const on = value === c.key;
        return (
          <button key={c.key} type="button" onClick={() => onChange(c.key)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition-colors",
              on ? "bg-[var(--foreground)] text-[var(--background)] border-[var(--foreground)]"
                 : "bg-[var(--card)] text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--foreground)]",
            )}>
            {c.label}
            <span className={cn("text-[10px] font-bold", on ? "opacity-70" : "opacity-60")}>{counts[c.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

// Thin wrapper around ui.tsx's `Switch` — flag flip only (no regenerate). `optimistic` flips the
// switch instantly on click, independent of when the server's `active` catches up (see the toggle
// gotcha), so it never reads as laggy.
function SwitchRow({
  active, toggling, onToggle,
}: { active: boolean; toggling: boolean; onToggle: () => void }) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => {
    if (toggling) return;
    let alive = true;
    Promise.resolve().then(() => { if (alive) setOptimistic(null); });
    return () => { alive = false; };
  }, [toggling]);
  const checked = optimistic ?? active;
  return (
    <Switch checked={checked} disabled={toggling}
      onChange={() => { setOptimistic(!checked); onToggle(); }}
      aria-label={checked ? "Turn off" : "Turn on"} />
  );
}

// One single-line change row. Tap the row → the Edit item menu (same as tapping the item on the
// photo). The switch toggles in place; a never-rendered ("pending") change can be X-deleted. All
// deeper detail (Shop similar, Save $X, adjust) lives in the menu, not on the row.
function CompactRow({
  ws, item, toggling, onToggle,
}: { ws: RestyleWorkspace; item: RailItem; toggling: boolean; onToggle: (editId: string, active: boolean) => void }) {
  const { edit: e, status } = item;
  const label = e.target_label ?? "item";
  const isRemove = e.kind === "remove";
  const isRefine = e.kind === "refine";
  const isProduct = !isRemove && !isRefine && !!e.buy_url;
  const optimistic = e.id.startsWith("optimistic-");
  const { Icon, tone } = changeAction(e);
  const del = useDeleteConfirm();
  const tappable = !optimistic && !isRefine;

  const openMenu = () => { if (tappable) ws.openSourcing(label, e.kind === "add" ? "add" : "swap", e.id); };

  return (
    <div
      onClick={openMenu}
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-[var(--shadow-soft)]",
        tappable && "cursor-pointer hover:border-[var(--foreground)]/40 transition-colors",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[status])} aria-hidden />
      <div className="relative shrink-0 h-9 w-9">
        {!isRemove && !isRefine && e.reference_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={e.reference_url} alt="" className="h-9 w-9 object-cover rounded-lg border border-[var(--border)] bg-[var(--muted)]" />
        ) : e.kind === "add" && e.placement ? (
          <CroppedThumb imageUrl={ws.displayUrl} box_2d={boxFromPlacement(e.placement)}
            className="h-9 w-9 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--muted)]" />
        ) : (
          <span className={cn("h-9 w-9 rounded-lg bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center", TONE_ICON[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold capitalize truncate leading-tight">{e.product_title ?? label}</p>
        <p className="text-[10.5px] text-[var(--muted-foreground)] truncate leading-tight mt-0.5">
          {isProduct ? (
            <>
              {e.product_price && <span className="font-semibold text-[var(--foreground)]">{e.product_price} </span>}
              {storeName(e.buy_url)}
            </>
          ) : (
            changeSource(e)
          )}
        </p>
      </div>
      <div onClick={(ev) => ev.stopPropagation()} className="shrink-0">
        {optimistic ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
        ) : (
          <SwitchRow active={e.active} toggling={toggling} onToggle={() => onToggle(e.id, !e.active)} />
        )}
      </div>
      {status === "pending" && !optimistic ? (
        <button type="button" aria-label="Delete this change"
          onClick={(ev) => { ev.stopPropagation(); del.request(isRemove ? `"Removed the ${label}"` : label, () => ws.remove(e.id)); }}
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : tappable ? (
        <ChevronRight className="h-4 w-4 text-[var(--border)] shrink-0" />
      ) : null}
      {del.dialog}
    </div>
  );
}

// The "Shop" tab — only products your changes actually put in the room (`ws.productEdits`), each a
// compact buy row with price · retailer · Buy, plus a running room total. Read-only aggregation.
function ShopPane({ ws }: { ws: RestyleWorkspace }) {
  const products = ws.productEdits;
  const { total, priced } = shopSummary(products);

  if (products.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-foreground)] py-1">
        Nothing to shop yet. Swap or add an item, then Generate — the buyable pieces in your room show up here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {priced > 0 && (
        <div className="flex items-center justify-between px-1 pb-0.5">
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {priced} product{priced === 1 ? "" : "s"} in your room
          </span>
          <span className="text-sm font-semibold">
            ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      )}
      {products.map((e) => (
        <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-soft)]">
          <div className="relative shrink-0 h-12 w-12">
            {e.reference_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={e.reference_url} alt="" className="h-12 w-12 object-cover rounded-xl border border-[var(--border)] bg-[var(--muted)]" />
            ) : (
              <span className="h-12 w-12 rounded-xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)]">
                <ShoppingBag className="h-4 w-4" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium capitalize truncate">{e.product_title ?? e.target_label ?? "item"}</p>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--muted-foreground)]">
              {e.product_price && <span className="font-semibold text-[var(--foreground)]">{e.product_price}</span>}
              {e.buy_url && <span>· {storeName(e.buy_url)}</span>}
            </p>
          </div>
          {e.buy_url && (
            <a href={e.buy_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] text-xs font-semibold px-3.5 py-2 hover:opacity-90 transition-opacity shrink-0">
              <ExternalLink className="h-3.5 w-3.5" /> Buy
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
