"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { House, Images } from "lucide-react";
import AppTabBar from "./AppTabBar";
import Wordmark from "@/components/Wordmark";

// 3D Tours and Reels aren't shipping in the MVP. Tours: nav-hidden only (the /tours/* routes and
// DB table are untouched). Reels: fully sunset — its app code (pages/routes/lib) was deleted
// entirely, since it was also confirmed broken (reel status never actually polled Higgsfield).
// See CLAUDE.md.
const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: House },
  { href: "/restyle", label: "Room Restyle", Icon: Images },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-full">
      {/* Mobile top bar — nav lives entirely in AppTabBar now; this only carries branding + account.
          Blends into the warm background (no divider) for the clean, card-forward look. */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-[var(--background)]/85 backdrop-blur-md">
        <Link href="/" aria-label="Nook home"><Wordmark className="text-2xl" /></Link>
        <UserButton />
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 border-r border-[var(--border)] bg-[var(--card)] flex-col fixed h-full top-0 left-0 z-20">
        <div className="p-5 border-b border-[var(--border)]">
          <Link href="/" aria-label="Nook home"><Wordmark className="text-2xl" /></Link>
        </div>
        <nav className="flex-1 p-4 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-full text-sm transition-colors ${
                isActive(item.href)
                  ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              <item.Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-3">
            <UserButton />
            <Link href="/pricing" className="text-xs text-[var(--muted-foreground)] hover:underline">
              Upgrade plan
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar — the only mobile nav surface. */}
      <AppTabBar />

      {/* Main content — bottom padding clears the fixed tab bar on mobile. */}
      <main className="lg:ml-56 p-4 sm:p-6 lg:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8">
        {children}
      </main>
    </div>
  );
}
