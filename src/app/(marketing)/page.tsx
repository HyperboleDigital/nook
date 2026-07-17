import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { Camera, MousePointerClick, Sparkles, ShoppingBag, Share2, Check } from "lucide-react";

// How it works — the real Room Restyle flow, no 3D tours / Reels (both cut from the MVP).
const STEPS = [
  {
    Icon: Camera,
    title: "Snap the room",
    body: "Upload or take a photo of any room. Nook instantly finds the furniture and decor you can change.",
  },
  {
    Icon: MousePointerClick,
    title: "Tap any item",
    body: "Tap a sofa, a rug, a light — then swap it, restyle it, or remove it. Source from a photo, a product link, or just describe it.",
  },
  {
    Icon: Sparkles,
    title: "Let AI restage it",
    body: "Nook restages the room around your change in seconds, so your client sees the space reimagined — not just a mood board.",
  },
  {
    Icon: ShoppingBag,
    title: "Shop the look",
    body: "Every swapped piece is matched to a real, buyable product with a price and a link — turning a redesign into a shopping list.",
  },
];

const HIGHLIGHTS = [
  "Upload or take a photo of the room",
  "Tap an item to swap, adjust, or remove it",
  "AI restages the whole room in seconds",
  "Every piece matched to a real, buyable product",
  "Share a client link with tappable shop-the-look",
  "Works on any phone — no app to install",
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
        <div className="inline-flex items-center gap-2 bg-[var(--muted)] rounded-full px-4 py-1.5 text-sm text-[var(--muted-foreground)] mb-8">
          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          Now in early access
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-[-0.03em] leading-[1.05] mb-6">
          Reimagine any room.
          <br />
          Then <span className="text-[var(--accent)]">shop the look.</span>
        </h1>
        <p className="text-lg sm:text-xl text-[var(--muted-foreground)] max-w-2xl mx-auto mb-10 leading-relaxed">
          Snap a photo of a room, tap any item, and swap or restyle it with AI. Nook restages the
          space in seconds and matches every piece to a real product your client can buy — all from
          one shareable link. Built for real estate agents and stagers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <SignUpButton mode="modal">
            <button className="bg-[var(--primary)] text-[var(--primary-foreground)] px-7 py-3.5 rounded-full text-base font-medium hover:bg-black transition-colors shadow-[var(--shadow-soft)]">
              Start for free →
            </button>
          </SignUpButton>
          <Link
            href="/pricing"
            className="border border-[var(--border)] bg-[var(--card)] px-7 py-3.5 rounded-full text-base font-medium hover:border-[var(--foreground)] transition-colors"
          >
            See pricing
          </Link>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mt-4">
          No credit card required · Your first restyles are free
        </p>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ Icon, title, body }, i) => (
            <div
              key={title}
              className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-soft)]"
            >
              <div className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-5">
                <Icon className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="text-xs font-semibold text-[var(--muted-foreground)] mb-1">
                Step {i + 1}
              </div>
              <h3 className="text-lg font-bold tracking-tight mb-2">{title}</h3>
              <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature spotlight */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="rounded-[28px] border border-[var(--border)] bg-[var(--card)] p-8 sm:p-12 shadow-[var(--shadow-soft)]">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)] px-3 py-1 text-xs font-semibold mb-5">
              <Sparkles className="w-3.5 h-3.5" /> Room Restyle
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] mb-4">
              A redesign your client can actually shop.
            </h2>
            <p className="text-[var(--muted-foreground)] text-lg leading-relaxed mb-8">
              Most staging tools stop at a pretty picture. Nook turns every change into a real,
              buyable product — so a reimagined room doubles as a shopping list your client can act on.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {HIGHLIGHTS.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
                <span className="text-[var(--foreground)]">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--muted)] border-y border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Ready to reimagine a room?</h2>
          <p className="text-[var(--muted-foreground)] mb-8 max-w-lg mx-auto leading-relaxed">
            Join the agents and stagers using Nook to turn a single room photo into a shoppable
            redesign — in minutes, from their phone.
          </p>
          <div className="flex items-center justify-center gap-3">
            <SignUpButton mode="modal">
              <button className="bg-[var(--primary)] text-[var(--primary-foreground)] px-7 py-3.5 rounded-full text-base font-medium hover:bg-black transition-colors shadow-[var(--shadow-soft)]">
                Restyle your first room free →
              </button>
            </SignUpButton>
            <Link
              href="/pricing"
              className="hidden sm:inline-flex items-center gap-1.5 px-5 py-3.5 rounded-full text-base font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              <Share2 className="w-4 h-4" /> See plans
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
