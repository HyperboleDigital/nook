"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const NAV = [
  { href: "/dashboard", label: "Dashboard", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/tours/new", label: "New 3D Tour", d: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" },
  { href: "/tours/new-model", label: "Upload 3D Model", d: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" },
  { href: "/restyle", label: "Room Restyle", d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { href: "/reels/new", label: "New Reel", d: "M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const navLinks = (
    <nav className="flex-1 p-4 space-y-0.5">
      {NAV.map(item => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
            isActive(item.href)
              ? "bg-[var(--foreground)] text-[var(--background)] font-medium"
              : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
          }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.d} />
          </svg>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const sidebarInner = (
    <>
      <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
        <Link href="/" onClick={() => setOpen(false)} className="text-lg font-bold tracking-tight" style={{ letterSpacing: "-0.04em" }}>
          nook
        </Link>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="lg:hidden text-[var(--muted-foreground)] hover:text-slate-900"
          aria-label="Close menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {navLinks}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
          <UserButton />
          <Link href="/pricing" className="text-xs text-[var(--muted-foreground)] hover:underline">
            Upgrade plan
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-full">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-[var(--border)] bg-[var(--card)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-slate-700 hover:text-slate-900"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" className="text-lg font-bold tracking-tight">nook</Link>
        <UserButton />
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 border-r border-[var(--border)] bg-[var(--card)] flex-col fixed h-full top-0 left-0 z-20">
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 max-w-[80vw] bg-[var(--card)] border-r border-[var(--border)] flex flex-col shadow-xl">
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="lg:ml-56 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
