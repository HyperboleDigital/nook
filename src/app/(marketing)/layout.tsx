import Link from "next/link";
import NavAuth from "@/components/nav-auth";
import Wordmark from "@/components/Wordmark";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="Nook home">
            <Wordmark className="text-2xl" />
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/pricing"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Pricing
            </Link>
            <NavAuth />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-sm text-[var(--muted-foreground)] flex flex-col sm:flex-row gap-2 justify-between items-center">
          <span>© 2026 Nook. All rights reserved.</span>
          <span>Reimagine any room, then shop the look.</span>
        </div>
      </footer>
    </div>
  );
}
