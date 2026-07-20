"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Eraser, Loader2, Plus, ShoppingBag, Sparkles, Wand2, X } from "lucide-react";
import { boxFromPlacement, type ChangeFilter, type RailItem, type RailStatus, type RestyleWorkspace } from "./useRestyleWorkspace";
import type { RestyleEdit } from "@/types";
import { ConfirmDialog, Switch, storeName } from "./ui";
import { cn } from "@/lib/utils";
import CroppedThumb from "./CroppedThumb";

// A small status dot on each compact row — colour matches the honest-labeling meaning (amber =
// needs generate, accent = actually in the room, grey = off).
const STATUS_DOT: Record<RailStatus, string> = {
  pending: "bg-amber-500", "turning-off": "bg-amber-500", "in-room": "bg-[var(--accent)]", off: "bg-[var(--border)]",
};

// The four change kinds, ordered exactly the way the user asked to see them grouped: products
// that were swapped, then added, then adjustments, then removed items. Sorting is primarily by
// kind, with each kind's own pending-first ordering preserved as a secondary tiebreak (see
// `STATUS_ORDER` below) so a not-yet-generated change still surfaces near the top of its group.
type ChangeTone = "swap" | "add" | "adjust" | "remove";
const KIND_ORDER: Record<ChangeTone, number> = { swap: 0, add: 1, adjust: 2, remove: 3 };
const STATUS_ORDER: Record<RailStatus, number> = { pending: 0, "turning-off": 1, "in-room": 2, off: 3 };

// Same gradient badges as SourcePanel's "Edit item" menu (MENU_ROW_TONES) — a swapped/added/
// adjusted/removed row should read as the same category the user picked from that menu, not a
// separate color language. "Add" borrows the menu's "shop" (emerald/teal) slot — there's no
// per-item "add" row in that menu (a fresh add skips it entirely), so it's the closest available
// meaning: a brand-new product now in the room.
const ROW_TONES: Record<ChangeTone, string> = {
  swap: "from-violet-500 to-fuchsia-500",
  add: "from-emerald-500 to-teal-500",
  adjust: "from-amber-400 to-orange-500",
  remove: "from-red-500 to-rose-600",
};

// A row with a real buy_url gets the SAME shopping-bag convention used everywhere else in the
// app (canvas hotspots, the "Edit item" menu) — "this is an actual, buyable product" — instead of
// the kind-based icon above, which only says WHAT changed (swap/add/adjust/remove), not whether
// it's shoppable. An add/swap sourced from a plain description or an unresolved inspo photo still
// gets the kind-based icon, so it reads as "AI-placed, nothing to buy yet."
const PRODUCT_TONE = "from-emerald-500 to-teal-500";

function changeAction(e: RestyleEdit): { verb: string; Icon: typeof Plus; tone: ChangeTone } {
  if (e.kind === "remove") return { verb: "Removed", Icon: Eraser, tone: "remove" };
  if (e.kind === "refine") return { verb: "Adjusted", Icon: Wand2, tone: "adjust" };
  if (e.kind === "add") return { verb: "Added", Icon: Plus, tone: "add" };
  return { verb: "Swapped", Icon: Sparkles, tone: "swap" };
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
 * The Changes rail is CANVAS-FIRST: a big "Room Changes · N" header, a row of filter chips
 * (All / Pending / In room / Off — these also drive the canvas, dimming markers that don't match
 * the active filter, see ObjectHotspots), then a compact list. Each row is a single line — tap it
 * to open the Edit item menu (same path as tapping the item on the photo); the switch toggles in
 * place; a never-rendered ("pending") change can be deleted with the X. Detail (Shop similar,
 * Save $X, adjust) lives in the menu the row opens, not crammed onto the row. Rows are grouped by
 * KIND (swap → add → adjust → remove — see `KIND_ORDER`), not by status; there's no separate
 * "Shop" tab — the canvas's own shop-summary pill + ShopCart already cover that read-only product
 * view, so this rail stays focused on "what changed."
 */
export default function ChangesPanel({ ws }: { ws: RestyleWorkspace }) {
  const { railEdits, changeFilter, setChangeFilter } = ws;
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const rows = railEdits.slice().sort((a, b) => {
    const ka = KIND_ORDER[changeAction(a.edit).tone], kb = KIND_ORDER[changeAction(b.edit).tone];
    return ka !== kb ? ka - kb : STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  });
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
  // "All" so the filter (and the canvas dimming) don't get stuck on an empty slice.
  const filterEmpty = changeFilter !== "all" && counts[changeFilter] === 0;
  useEffect(() => { if (filterEmpty) setChangeFilter("all"); }, [filterEmpty, setChangeFilter]);

  const toggleEdit = async (editId: string, active: boolean) => {
    setTogglingId(editId);
    try { await ws.toggle(editId, active); } finally { setTogglingId(null); }
  };

  if (railEdits.length === 0) {
    return (
      <div className="space-y-3">
        <Header count={0} />
        <p className="text-xs text-white/60">
          Nothing queued yet — tap an item to swap it, or add something new.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header count={railEdits.length} />
      <FilterChips counts={counts} value={changeFilter} onChange={setChangeFilter} />
      {shown.length === 0 ? (
        <p className="text-xs text-white/60 py-2 text-center">Nothing here.</p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((r) => (
            <CompactRow key={r.edit.id} ws={ws} item={r} toggling={togglingId === r.edit.id} onToggle={toggleEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({ count }: { count: number }) {
  return (
    <h2 className="text-lg font-bold tracking-[-0.02em] text-white">
      Room Changes{count > 0 && <span className="text-white/60 font-semibold"> · {count}</span>}
    </h2>
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
              on ? "bg-white text-[var(--foreground)] border-white"
                 : "bg-white/10 text-white/70 border-white/20 hover:border-white/40 hover:text-white",
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
  const { Icon: KindIcon, tone } = changeAction(e);
  const BadgeIcon = isProduct ? ShoppingBag : KindIcon;
  const badgeTone = isProduct ? PRODUCT_TONE : ROW_TONES[tone];
  const del = useDeleteConfirm();
  const tappable = !optimistic && !isRefine;

  const openMenu = () => { if (tappable) ws.openSourcing(label, e.kind === "add" ? "add" : "swap", e.id); };

  return (
    <div
      onClick={openMenu}
      className={cn(
        "glass-card flex items-center gap-2.5 rounded-xl p-2",
        tappable && "cursor-pointer hover:border-white/35 transition-colors",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_DOT[status])} aria-hidden />
      <div className="relative shrink-0 h-9 w-9">
        {!isRemove && !isRefine && e.reference_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.reference_url} alt="" className="h-9 w-9 object-cover rounded-lg border border-white/20 bg-white/10" />
            {/* Category corner badge — a photo thumbnail would otherwise hide which of the
                four Edit-item-menu categories (swap/add/adjust/remove) this row is, so the
                same gradient + icon reappears here at a small scale. */}
            <span className={cn(
              "absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-white ring-2 ring-black/25 bg-gradient-to-br",
              badgeTone,
            )}>
              <BadgeIcon className="h-2.5 w-2.5" />
            </span>
          </>
        ) : e.kind === "add" && e.placement ? (
          <>
            <CroppedThumb imageUrl={ws.displayUrl} box_2d={boxFromPlacement(e.placement)}
              className="h-9 w-9 rounded-lg overflow-hidden border border-white/20 bg-white/10" />
            <span className={cn(
              "absolute -bottom-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-white ring-2 ring-black/25 bg-gradient-to-br",
              badgeTone,
            )}>
              <BadgeIcon className="h-2.5 w-2.5" />
            </span>
          </>
        ) : (
          // No reference photo to show — the category badge becomes the whole thumbnail
          // instead of a corner accent, same gradient-sheen treatment as SourcePanel's
          // "Edit item" menu rows (MenuRow) so it reads as the identical category.
          <span className={cn(
            "h-9 w-9 rounded-lg shrink-0 flex items-center justify-center text-white bg-gradient-to-br bg-[length:200%_200%] animate-[icon-gradient-shift_4s_ease-in-out_infinite]",
            badgeTone,
          )}>
            <BadgeIcon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold capitalize truncate leading-tight text-white">{e.product_title ?? label}</p>
        <p className="text-[10.5px] text-white/60 truncate leading-tight mt-0.5">
          {isProduct ? (
            <>
              {e.product_price && <span className="font-semibold text-white">{e.product_price} </span>}
              {storeName(e.buy_url)}
            </>
          ) : (
            changeSource(e)
          )}
        </p>
      </div>
      <div onClick={(ev) => ev.stopPropagation()} className="shrink-0">
        {optimistic ? (
          <Loader2 className="h-4 w-4 animate-spin text-white/60" />
        ) : (
          <SwitchRow active={e.active} toggling={toggling} onToggle={() => onToggle(e.id, !e.active)} />
        )}
      </div>
      {/* Fixed-width trailing slot regardless of content (delete X / chevron / nothing) — this
          is what keeps the switch above at the SAME horizontal position on every row. When this
          slot's width varied by content, the switch (laid out just before it) drifted left/right
          row to row instead of lining up in a clean column. */}
      <div className="shrink-0 h-6 w-6 flex items-center justify-center">
        {status === "pending" && !optimistic ? (
          <button type="button" aria-label="Delete this change"
            onClick={(ev) => { ev.stopPropagation(); del.request(isRemove ? `"Removed the ${label}"` : label, () => ws.remove(e.id)); }}
            className="h-6 w-6 flex items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : tappable ? (
          <ChevronRight className="h-4 w-4 text-white/30" />
        ) : null}
      </div>
      {del.dialog}
    </div>
  );
}
