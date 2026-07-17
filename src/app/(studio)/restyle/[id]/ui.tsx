"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ChevronRight, ExternalLink, ShoppingBag, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RestyleEdit } from "@/types";

// ── Button ───────────────────────────────────────────────────────────────────
// Warm Modern: pill shape, near-black primary, forest-green accent, soft shadows
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium cursor-pointer whitespace-nowrap select-none disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-black transition-colors",
        outline:
          "border border-[var(--border)] text-[var(--foreground)] bg-[var(--card)] hover:border-[var(--foreground)] transition-colors",
        ghost:
          "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors",
        subtle:
          "bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--foreground)] transition-colors",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90 transition-opacity",
        accent:
          "bg-[var(--accent)] text-[var(--accent-foreground)] hover:opacity-90 transition-opacity",
        accentSoft:
          "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] transition-colors",
      },
      size: {
        sm: "text-xs px-3 py-1.5 h-8",
        md: "text-sm px-4 py-2 h-9",
        lg: "text-sm px-5 py-3 h-11 font-semibold tracking-wide",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className, variant, size, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

// ── IconButton ────────────────────────────────────────────────────────────────
// Round floating button for canvas overlays — soft shadow lifts it off the photo
// `before:-inset-1.5` extends the actual hit area to ~48px without growing the 36px visual —
// keeps desktop density unchanged while meeting the 44px touch-target guideline on mobile.
export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "relative h-9 w-9 inline-flex items-center justify-center rounded-full",
        "before:absolute before:-inset-1.5 before:rounded-full before:content-['']",
        "bg-white border border-[var(--border)] text-[var(--muted-foreground)] shadow-[var(--shadow-soft)]",
        "hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
        "cursor-pointer disabled:opacity-40 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

// ── Switch ────────────────────────────────────────────────────────────────────
// A real on/off switch (not an icon button) — used for the per-item "turn this off, revert
// to original" control on a placed hotspot/product card. `checked` is presentational only;
// callers regenerate immediately on toggle rather than tracking a persistent off state.
//
// `disabled` does NOT use the native HTML disabled attribute — that blocks the click event
// entirely, so there'd be no way to tell the user WHY nothing happened when they tap a locked
// switch. Instead the switch stays clickable but visibly muted (grey track, not accent green,
// regardless of `checked`) and routes taps to `onDisabledClick` instead of `onChange`, so the
// caller can surface a "here's why" message rather than the switch just silently doing nothing.
export function Switch({
  checked, onChange, disabled, onDisabledClick, "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  onDisabledClick?: () => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => (disabled ? onDisabledClick?.() : onChange())}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        // Extends the hit area to a real touch target without growing the visible track —
        // ChangesPanel's SwitchRow already gives the row vertical room for this.
        "before:absolute before:-inset-y-3 before:-inset-x-2 before:content-['']",
        disabled
          // Genuinely locked (can't interact at all) — pale, matches other disabled controls.
          ? "bg-[var(--muted)] cursor-not-allowed"
          : cn(
              "cursor-pointer",
              // An OFF-but-toggleable switch used to share this exact pale shade with the
              // disabled state above (--border and --muted are nearly the same near-white
              // beige), which read as "this is locked" rather than "tap to turn back on" — a
              // clearly mid-gray, saturated-enough track fixes that ambiguity.
              checked ? "bg-[var(--accent)]" : "bg-[var(--muted-foreground)]/45",
            ),
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full shadow-[var(--shadow-soft)] transition-transform",
          disabled ? "bg-white/60" : "bg-white",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function storeName(url: string | null | undefined): string {
  if (!url) return "store";
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (/amazon\./.test(h)) return "Amazon";
    if (/wayfair\./.test(h)) return "Wayfair";
    if (/walmart\./.test(h)) return "Walmart";
    if (/homedepot\./.test(h)) return "Home Depot";
    if (/target\./.test(h)) return "Target";
    if (/lowes\./.test(h)) return "Lowe's";
    return h.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  } catch { return "store"; }
}

export function matchWord(score: number | null, exact: boolean): { label: string; cls: string } {
  if (score == null) return { label: exact ? "Match" : "Similar", cls: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
  if (score >= 8) return { label: "Great match", cls: "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]" };
  if (score >= 5) return { label: "Close match", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  return { label: "Similar", cls: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
}

// ── ProductCard ───────────────────────────────────────────────────────────────
// Warm Modern: rounded card, soft shadow lift on hover
export function ProductCard({
  image, title, retailer, price, viewUrl, badge, children,
}: {
  image?: string | null;
  title: string;
  retailer?: string | null;
  price?: string | null;
  viewUrl?: string | null;
  badge?: { label: string; cls: string };
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-pop)] transition-shadow">
      {/* Thumbnail — fixed square, rounded */}
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image}
          alt=""
          className="h-16 w-16 object-cover rounded-xl border border-[var(--border)] shrink-0 bg-[var(--muted)]"
        />
      ) : (
        <div className="h-16 w-16 rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {badge && (
          <span className={cn("inline-block rounded-full text-[10px] px-1.5 py-0.5 font-medium tracking-wide uppercase", badge.cls)}>
            {badge.label}
          </span>
        )}

        <p className="text-sm font-medium text-[var(--foreground)] line-clamp-2 leading-snug tracking-tight">
          {title}
        </p>

        <div className="flex items-center gap-2 text-xs">
          {price ? (
            <span className="font-semibold text-[var(--foreground)]">{price}</span>
          ) : viewUrl ? (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--muted-foreground)] underline hover:text-[var(--foreground)] transition-colors"
            >
              See price
            </a>
          ) : (
            <span className="text-[var(--muted-foreground)]">Price varies</span>
          )}
          {retailer && (
            <span className="text-[var(--muted-foreground)]">· {retailer}</span>
          )}
        </div>

        {viewUrl && (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            View on {storeName(viewUrl)} <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {children}
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
// One sized spinner (this file used to have ~10 hand-rolled copies of this div).
const spinnerVariants = cva("inline-block rounded-full border-2 border-current/25 border-t-current animate-spin", {
  variants: { size: { xs: "h-3 w-3", sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-7 w-7" } },
  defaultVariants: { size: "sm" },
});
export function Spinner({ size, className }: VariantProps<typeof spinnerVariants> & { className?: string }) {
  return <span className={cn(spinnerVariants({ size }), className)} />;
}

// ── Input ─────────────────────────────────────────────────────────────────────
// Pill-shaped, border-only focus state
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full bg-[var(--card)] border border-[var(--border)] rounded-full px-4 py-2 text-sm",
        "placeholder:text-[var(--muted-foreground)] focus:outline-none focus:border-[var(--foreground)]",
        "transition-colors",
        className,
      )}
      {...props}
    />
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]", className)}>
      {children}
    </p>
  );
}

// ── StatusBanner ──────────────────────────────────────────────────────────────
// Replaces every ad-hoc emerald/amber/red rounded box across the restyle screens.
const bannerVariants = cva("flex items-start gap-2 rounded-xl border px-3 py-2 text-xs", {
  variants: {
    variant: {
      info: "bg-[var(--muted)] border-[var(--border)] text-[var(--foreground)]",
      success: "bg-emerald-50 border-emerald-200 text-emerald-800",
      warning: "bg-amber-50 border-amber-200 text-amber-800",
      error: "bg-red-50 border-red-200 text-red-700",
    },
  },
  defaultVariants: { variant: "info" },
});
export function StatusBanner({
  variant, icon, children, className,
}: VariantProps<typeof bannerVariants> & { icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn(bannerVariants({ variant }), className)}>
      {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[var(--muted)]", className)} />;
}

/** Placeholder matching ProductCard's geometry — shown while search results load. */
export function SkeletonProductCard() {
  return (
    <div className="flex gap-3 p-3 rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-6 w-24 mt-2" />
      </div>
    </div>
  );
}

// ── ProgressOverlay ───────────────────────────────────────────────────────────
// Warm, playful lines rotated under the progress bar while a room generates. Kept here (not a
// prop) so every caller gets the same personality for free — pass `messages` only to override.
export const GENERATE_MESSAGES = [
  "Fluffing the pillows…",
  "Hanging the art straight…",
  "Rolling out the rug…",
  "Nudging the sofa two inches to the left…",
  "Letting in the afternoon light…",
  "Checking the feng shui…",
  "Warming up the color palette…",
  "Dusting the shelves before the big reveal…",
  "Matching the shadows to the sunlight…",
  "Stepping back to admire the room…",
  "Adding the finishing touches…",
];

// Full-bleed overlay for the canvas during generate. Self-ticking: given `startedAt` (epoch
// ms), it computes its own rotating message index on a 300ms interval — nothing above it
// re-renders on every tick (that used to live in the shared workspace hook and re-rendered the
// whole editor tree once per interval). Deliberately no %/"time left" anymore — a time-based
// estimate (Gemini's image-generation call has no real progress signal) read as more precise
// than it actually was; the spinner + rotating warm message carries the "this is working" signal
// without pretending to know how far along it is. `expectedSeconds` is kept as a prop so callers
// don't need updating, but is no longer used here.
export function ProgressOverlay({
  status = "Generating your room…", startedAt, expectedSeconds, messages = GENERATE_MESSAGES,
}: {
  status?: string; startedAt: number; expectedSeconds?: number; messages?: string[];
}) {
  void expectedSeconds; // kept as a prop so existing callers don't need updating; no longer used
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(interval);
  }, []);

  const elapsedSeconds = Math.max(0, (now - startedAt) / 1000);
  const messageIndex = Math.floor(elapsedSeconds / 3.5) % messages.length;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--background)]/85 text-center px-4">
      <Spinner size="lg" className="text-[var(--primary)]" />
      <p className="text-sm font-medium text-[var(--foreground)]">{status}</p>
      <p key={messageIndex} className="text-xs text-[var(--muted-foreground)] animate-[fade-in_0.3s_ease-out]">
        {messages[messageIndex]}
      </p>
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
// Detected-item / staged-item chips. sm for compact rows, md meets the 40px touch target.
const chipVariants = cva(
  "inline-flex items-center gap-1.5 border rounded-full font-medium capitalize whitespace-nowrap cursor-pointer transition-colors select-none",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] text-[var(--muted-foreground)] bg-[var(--card)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
        active: "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]",
        staged: "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]",
        dashed: "border-dashed border-[var(--border)] text-[var(--muted-foreground)] bg-[var(--card)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
      },
      size: {
        sm: "text-xs px-2.5 py-1 h-7",
        md: "text-sm px-3.5 min-h-10",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);
export function Chip({
  className, variant, size, staged, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof chipVariants> & { staged?: boolean }) {
  return (
    <button type="button" className={cn(chipVariants({ variant, size }), className)} {...props}>
      {props.children}
      {staged && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0" />}
    </button>
  );
}

// ── SegmentedTabs ─────────────────────────────────────────────────────────────
// Pill tab switcher (link/photo/describe) — active tab floats on a soft shadow.
export function SegmentedTabs<T extends string>({
  options, value, onChange, className,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex rounded-full bg-[var(--muted)] p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-full py-2 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-soft)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── GlassSegmented ────────────────────────────────────────────────────────────
// A segmented pill whose active indicator GLIDES between options — a frosted-glass "thumb" that
// slides on `transform` rather than hard-swapping a background between buttons (the difference
// SegmentedTabs above has). This is the fluid active/inactive transition the glass system calls
// for; it's also the control for the studio's "Changes / Shop" split. Dark glass, meant to float
// on a photo — pair the container's `.glass-surface` with `.glass-seg-thumb` (both in globals.css).
//
// The thumb is one segment wide and translated by `activeIndex × 100%` of its own width, which
// lands it exactly over each equal-width button. Reduced-motion users get an instant swap for
// free — globals.css's prefers-reduced-motion block strips the thumb's transition.
export function GlassSegmented<T extends string>({
  options, value, onChange, className,
}: {
  options: { value: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const n = options.length;
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className={cn("glass-surface relative flex rounded-full p-1", className)}>
      <span
        aria-hidden
        className="glass-seg-thumb pointer-events-none absolute inset-y-1 left-1 rounded-full"
        style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${activeIndex * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "relative z-10 flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold transition-colors",
              active ? "text-white" : "text-white/55 hover:text-white/85",
            )}
          >
            {o.icon}
            {o.label}
            {typeof o.count === "number" && (
              <span className={cn(
                "ml-0.5 rounded-full px-1.5 text-[10px] font-bold leading-tight",
                active ? "bg-white/25 text-white" : "bg-white/10 text-white/70",
              )}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Locks/restores document scroll while `active` is true — shared by Sheet and Modal so the
// page underneath can't scroll behind an open overlay on touch.
function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

// ── Sheet ─────────────────────────────────────────────────────────────────────
// Mobile-only fixed bottom sheet + backdrop. On desktop the caller docks a persistent right
// column instead (see RestyleStudio) — the studio's right rail is always present there
// (defaults to "Shop this look"), so a modal overlay doesn't fit; SheetChrome is exported so
// that docked column can reuse the same title-bar + close-button styling.
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startTime: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useBodyScrollLock(open);

  // Drag-to-dismiss on the grabber/header only (not the scrollable body, so it doesn't fight
  // list scrolling). Direct ref mutation during the drag, never React state — the same
  // drag-perf pattern as the canvas compare slider (state on every pointermove re-renders
  // whatever's mounted above it).
  const onDragStart = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startTime: Date.now() };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !panelRef.current) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    panelRef.current.style.transition = "none";
    panelRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onDragEnd = (e: React.PointerEvent) => {
    if (!dragRef.current || !panelRef.current) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    const elapsedMs = Math.max(1, Date.now() - dragRef.current.startTime);
    const velocity = dy / elapsedMs; // px/ms
    panelRef.current.style.transition = "transform 150ms cubic-bezier(0,0,0.2,1)";
    if (dy > 100 || velocity > 0.5) {
      onClose();
    } else {
      panelRef.current.style.transform = "translateY(0)";
    }
    dragRef.current = null;
  };

  if (!open) return null;
  return (
    <div className="md:hidden">
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        ref={panelRef}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] flex flex-col rounded-t-3xl border-t border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-pop)] pb-[env(safe-area-inset-bottom)] animate-[sheet-up_200ms_ease-out]"
      >
        <div
          className="flex justify-center pt-1.5 shrink-0 touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className="h-1 w-10 rounded-full bg-[var(--border)]" />
        </div>
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <SheetChrome title={title} onClose={onClose} />
        </div>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function SheetChrome({ title, onClose }: { title?: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
      {title ? <h3 className="text-sm font-semibold tracking-tight">{title}</h3> : <span />}
      <IconButton onClick={onClose} aria-label="Close" className="h-7 w-7">
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
// Centered card + backdrop, usable on BOTH breakpoints — unlike `Sheet` above, which is
// deliberately mobile-only (the desktop editor docks a persistent right column instead). For
// a transient picker (e.g. StagePicker's style grid) that needs real screen space and isn't a
// permanent rail, a centered dialog is the right shape on desktop too. Reuses `SheetChrome` for
// the header/close button so there's no second chrome style to maintain.
export function Modal({
  open, onClose, title, children, widthClassName,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode; widthClassName?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useBodyScrollLock(open);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className={cn(
        "relative z-10 w-full max-h-[85vh] flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-pop)]",
        widthClassName ?? "max-w-md",
      )}>
        <SheetChrome title={title} onClose={onClose} />
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
// Replaces native window.confirm()/alert() — blocking OS dialogs that are jarring and
// off-brand, especially mid-edit in the immersive studio. Built on Modal (same primitive
// StagePicker already uses), full-width button pair for easy mobile tapping.
export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = "Confirm", destructive,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm text-[var(--muted-foreground)]">{body}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            size="lg"
            className="flex-1"
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Shop summary ──────────────────────────────────────────────────────────────
// Shared "n items · from $X" math + a floating pill for the canvas (see RestyleCanvas).
export function parsePrice(p: string | null | undefined): number {
  const n = Number(String(p ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function shopSummary(edits: RestyleEdit[]) {
  const total = edits.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const priced = edits.filter((e) => e.product_price).length;
  return { count: edits.length, total, priced };
}

export function ShopSummaryPill({ edits, onClick }: { edits: RestyleEdit[]; onClick?: () => void }) {
  const { count, total, priced } = shopSummary(edits);
  if (count === 0) return null;
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] text-white px-4 py-2 text-xs shadow-[var(--shadow-pop)] hover:opacity-90 transition-opacity">
      <ShoppingBag className="h-3.5 w-3.5" />
      <span>
        {count} item{count === 1 ? "" : "s"}
        {priced > 0 && (
          <> · from ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</>
        )}
      </span>
      <ChevronRight className="h-3.5 w-3.5 opacity-70" />
    </button>
  );
}
