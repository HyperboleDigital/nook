"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { House, Images, Plus } from "lucide-react";
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
 * The center button always starts a new room restyle (the only flow that fully exists today —
 * standalone "find this product" with no room isn't built, sourcing a product photo only
 * happens inside an already-created project). It's a Plus icon, not a camera one: the action is
 * "start something new," and a camera icon over-promised camera-only capture when the button
 * (like the icon it triggers, see below) has always also supported picking an existing photo.
 *
 * It owns a hidden file input directly (rather than the wizard page owning it) because opening
 * the OS picker from a tap requires a same-gesture click on a real `<input type="file">` — a
 * `.click()` fired after a client-side navigation is unreliable, especially on iOS Safari. The
 * captured/picked file is handed to the wizard via capture-handoff's module-scope stash, picked
 * up on mount at /restyle/new?captured=1.
 *
 * Deliberately NO `capture="environment"` on the input — that attribute forces the OS straight
 * into a camera-only capture view with no way to pick an existing photo (iOS's stripped-down
 * camera view has no "Photo Library" shortcut the way the full Camera app does; Android is
 * worse, often no gallery affordance at all). Plain `accept="image/*"` instead opens the native
 * chooser (iOS: Take Photo / Photo Library / Choose Files; Android: an app picker including
 * Camera and Gallery) — one tap still gets to the camera (it's always offered), but a photo
 * already on the phone is reachable too, which `capture` made impossible.
 */
export default function AppTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking/capturing the same file again next time
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
            aria-label="Start a new room restyle"
            className="relative -translate-y-3 h-14 w-14 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-pop)] flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus className="h-6 w-6" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={onPick}
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
