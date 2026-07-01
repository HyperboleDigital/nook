"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ExternalLink } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
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
