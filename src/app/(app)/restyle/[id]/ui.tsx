"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLink } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// ── Button ──────────────────────────────────────────────────────────────────
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
        outline: "border border-[var(--border)] text-slate-700 hover:border-slate-400",
        ghost: "text-slate-600 hover:text-slate-900 hover:bg-[var(--accent)]",
        subtle: "bg-[var(--muted)] text-slate-700 hover:bg-[var(--accent)] border border-[var(--border)]",
      },
      size: {
        sm: "text-xs px-3 py-1.5",
        md: "text-sm px-4 py-2.5",
        lg: "text-sm px-4 py-3 font-semibold",
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

/** Small square icon button, e.g. floating over the canvas. */
export function IconButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "h-9 w-9 inline-flex items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm border border-[var(--border)] text-slate-600 shadow-sm hover:text-slate-900 transition-colors disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Friendly store name from a product URL. */
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

/** Internal 0–10 match score → friendly word + color classes. */
export function matchWord(score: number | null, exact: boolean): { label: string; cls: string } {
  if (score == null) return { label: exact ? "Match" : "Similar", cls: "bg-slate-100 text-slate-500" };
  if (score >= 8) return { label: "Great match", cls: "bg-emerald-100 text-emerald-700" };
  if (score >= 5) return { label: "Close match", cls: "bg-amber-100 text-amber-700" };
  return { label: "Similar", cls: "bg-slate-100 text-slate-500" };
}

// ── ProductCard ───────────────────────────────────────────────────────────────
/** Reference-style product card used in "Shop this look" and the wizard match list. */
export function ProductCard({
  image, title, retailer, price, viewUrl, badge, children,
}: {
  image?: string | null;
  title: string;
  retailer?: string | null;
  price?: string | null;
  viewUrl?: string | null;
  badge?: { label: string; cls: string };
  children?: ReactNode; // extra actions (e.g. "Use this", alternates)
}) {
  return (
    <div className="flex gap-3 p-2.5 rounded-xl border border-[var(--border)] bg-white">
      {image ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={image} alt="" className="h-16 w-16 rounded-lg object-cover border border-[var(--border)] shrink-0 bg-[var(--muted)]" />
      ) : (
        <div className="h-16 w-16 rounded-lg bg-[var(--muted)] border border-[var(--border)] shrink-0" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {badge && <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded font-medium", badge.cls)}>{badge.label}</span>}
        <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">{title}</p>
        <div className="flex items-center gap-1.5 text-[11px]">
          {price
            ? <span className="font-semibold text-slate-800">{price}</span>
            : viewUrl
              ? <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-500 underline hover:text-slate-700">See price</a>
              : <span className="text-slate-400">Price varies</span>}
          {retailer && <span className="text-[var(--muted-foreground)]">· {retailer}</span>}
        </div>
        {viewUrl && (
          <a href={viewUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-slate-600 underline hover:text-slate-900">
            View on {storeName(viewUrl)} <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {children}
      </div>
    </div>
  );
}
