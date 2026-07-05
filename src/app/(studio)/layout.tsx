// Chrome-free shell for the immersive Room Restyle editor — no sidebar, no page padding, no
// max-width cap (contrast with (app)/layout.tsx). Sits alongside (app) as a sibling route
// group so the editor's URL (/restyle/[id]) is unchanged; auth is unaffected since Clerk
// protection in src/proxy.ts is path-based, not tied to route groups.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh overflow-hidden bg-[var(--background)]">{children}</div>;
}
