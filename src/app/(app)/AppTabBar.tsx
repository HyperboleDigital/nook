"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { House, Images, Camera } from "lucide-react";
import { stashCapturedFile } from "./restyle/new/capture-handoff";

const TABS = [
  { href: "/dashboard", label: "Home", Icon: House },
  { href: "/restyle", label: "Projects", Icon: Images },
] as const;

/**
 * Mobile-only bottom nav, the sole nav surface on phones (the hamburger drawer was removed —
 * both destinations live here). Mounted from (app)/layout.tsx only, so it never appears in the
 * (studio) editor, marketing pages, or the public share page (separate route groups).
 *
 * The center camera button owns a hidden file input directly (rather than the wizard page owning
 * it) because opening the OS camera from a tap requires a same-gesture click on a real
 * `<input capture>` — a `.click()` fired after a client-side navigation is unreliable, especially
 * on iOS Safari. The captured file is handed to the wizard via capture-handoff's module-scope
 * stash, picked up on mount at /restyle/new?captured=1.
 */
export default function AppTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const onCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow capturing the same shot again next time
    if (!file) return;
    stashCapturedFile(file);
    router.push("/restyle/new?captured=1");
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[var(--card)] border-t border-[var(--border)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="h-16 flex items-stretch">
        <TabLink href={TABS[0].href} label={TABS[0].label} Icon={TABS[0].Icon} active={isActive(TABS[0].href)} />

        <div className="flex-1 flex items-center justify-center">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Take a photo of a room"
            className="relative -translate-y-3 h-14 w-14 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-pop)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <Camera className="h-6 w-6" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onCapture}
          />
        </div>

        <TabLink href={TABS[1].href} label={TABS[1].label} Icon={TABS[1].Icon} active={isActive(TABS[1].href)} />
      </div>
    </nav>
  );
}

function TabLink({
  href, label, Icon, active,
}: { href: string; label: string; Icon: typeof House; active: boolean }) {
  return (
    <Link
      href={href}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0"
      aria-current={active ? "page" : undefined}
    >
      <span className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${active ? "bg-[var(--muted)]" : ""}`}>
        <Icon className={`h-5 w-5 ${active ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`} />
      </span>
      <span className={`text-[11px] ${active ? "text-[var(--foreground)] font-medium" : "text-[var(--muted-foreground)]"}`}>
        {label}
      </span>
    </Link>
  );
}
