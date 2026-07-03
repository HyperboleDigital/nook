"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLink, X } from "lucide-react";
import { useEffect } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Button ───────────────────────────────────────────────────────────────────
// Swiss: sharp corners, single primary accent, 150ms transitions, border depth only
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-none font-medium cursor-pointer whitespace-nowrap select-none disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-violet-700 transition-colors",
        outline:
          "border border-[var(--foreground)] text-[var(--foreground)] bg-transparent hover:bg-[var(--foreground)] hover:text-[var(--background)] transition-colors",
        ghost:
          "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors",
        subtle:
          "bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--foreground)] transition-colors",
        destructive:
          "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90 transition-opacity",
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
// Square floating button for canvas overlays — sharp, minimal chrome
export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "h-9 w-9 inline-flex items-center justify-center rounded-none",
        "bg-white border border-[var(--border)] text-[var(--muted-foreground)]",
        "hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
        "cursor-pointer disabled:opacity-40 transition-colors",
        className,
      )}
      {...props}
    />
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
  if (score >= 8) return { label: "Great match", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" };
  if (score >= 5) return { label: "Close match", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  return { label: "Similar", cls: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
}

// ── ProductCard ───────────────────────────────────────────────────────────────
// Swiss: clean grid, border-only depth, mathematical spacing, no shadows
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
    <div className="flex gap-3 p-3 border border-[var(--border)] bg-white hover:border-[var(--foreground)] transition-colors">
      {/* Thumbnail — fixed square, no rounding */}
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={image}
          alt=""
          className="h-16 w-16 object-cover border border-[var(--border)] shrink-0 bg-[var(--muted)]"
        />
      ) : (
        <div className="h-16 w-16 bg-[var(--muted)] border border-[var(--border)] shrink-0" />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-1">
        {badge && (
          <span className={cn("inline-block text-[10px] px-1.5 py-0.5 font-medium tracking-wide uppercase", badge.cls)}>
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
// Sharp, border-only focus state — replaces shared.ts's `inp` (rounded, ring-based).
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full bg-white border border-[var(--border)] rounded-none px-3 py-2 text-sm",
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
const bannerVariants = cva("flex items-start gap-2 border px-3 py-2 text-xs", {
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
  return <div className={cn("animate-pulse bg-[var(--muted)]", className)} />;
}

/** Placeholder matching ProductCard's geometry — shown while search results load. */
export function SkeletonProductCard() {
  return (
    <div className="flex gap-3 p-3 border border-[var(--border)] bg-white">
      <Skeleton className="h-16 w-16 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-6 w-24 mt-2" />
      </div>
    </div>
  );
}

// ── ProgressOverlay ───────────────────────────────────────────────────────────
// Full-bleed overlay for the canvas during generate — status + optional context line.
export function ProgressOverlay({ status, subtext }: { status: string; subtext?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-center px-4">
      <Spinner size="lg" className="text-[var(--primary)]" />
      <p className="text-sm font-medium text-[var(--foreground)]">{status}</p>
      {subtext && <p className="text-xs text-[var(--muted-foreground)]">{subtext}</p>}
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
// Detected-item / staged-item chips. sm for compact rows, md meets the 40px touch target.
const chipVariants = cva(
  "inline-flex items-center gap-1.5 border rounded-none font-medium capitalize whitespace-nowrap cursor-pointer transition-colors select-none",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] text-[var(--muted-foreground)] bg-white hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
        active: "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]",
        staged: "border-[var(--primary)] text-[var(--primary)] bg-white",
        dashed: "border-dashed border-[var(--border)] text-[var(--muted-foreground)] bg-white hover:border-[var(--foreground)] hover:text-[var(--foreground)]",
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
      {staged && <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] shrink-0" />}
    </button>
  );
}

// ── SegmentedTabs ─────────────────────────────────────────────────────────────
// Sharp tab switcher (link/photo/describe) — replaces the pill-shaped, shadowed version.
export function SegmentedTabs<T extends string>({
  options, value, onChange, className,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex border border-[var(--border)]", className)}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 py-2 text-xs font-medium transition-colors",
            i > 0 && "border-l border-[var(--border)]",
            value === o.value
              ? "bg-[var(--foreground)] text-[var(--background)]"
              : "bg-white text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────
// Mobile-only fixed bottom sheet + backdrop. On desktop the caller docks a persistent right
// column instead (see RestyleStudio) — the studio's right rail is always present there
// (defaults to "Shop this look"), so a modal overlay doesn't fit; SheetChrome is exported so
// that docked column can reuse the same title-bar + close-button styling.
// No drag-to-dismiss — X button + backdrop tap only.
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="md:hidden">
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] flex flex-col border-t border-[var(--foreground)] bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-1.5 shrink-0"><span className="h-1 w-10 bg-[var(--border)]" /></div>
        <SheetChrome title={title} onClose={onClose} />
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
