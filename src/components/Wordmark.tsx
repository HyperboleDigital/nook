import { cn } from "@/lib/utils";

// The "nook" brand wordmark — the geometric brand face (--font-brand, set in the root layout),
// tight tracking, with the two o's tinted forest-green so the mark reads as intentional, not just
// bold body text. One component so every surface (app header, sidebar, marketing) stays identical.
export default function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-[family-name:var(--font-brand)] font-semibold lowercase select-none", className)}
      style={{ letterSpacing: "-0.03em" }}
    >
      n<span className="text-[var(--accent)]">oo</span>k
    </span>
  );
}
