import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-[var(--muted)] rounded-full px-4 py-1.5 text-sm text-[var(--muted-foreground)] mb-8">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Now in early access
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          Turn any property video into
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-slate-600 to-slate-900">
            a 3D tour or viral Reel
          </span>
        </h1>
        <p className="text-xl text-[var(--muted-foreground)] max-w-2xl mx-auto mb-10">
          Upload a walkthrough video. Nook creates an immersive 3D tour and
          cinematic Instagram Reels — ready to share in minutes. Built for real
          estate agents who want to close faster.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <SignUpButton mode="modal">
            <button className="bg-[var(--primary)] text-[var(--primary-foreground)] px-8 py-3.5 rounded-xl text-base font-medium hover:opacity-90 transition-opacity">
              Start for free →
            </button>
          </SignUpButton>
          <Link
            href="/pricing"
            className="border border-[var(--border)] px-8 py-3.5 rounded-xl text-base font-medium hover:bg-[var(--muted)] transition-colors"
          >
            See pricing
          </Link>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mt-4">
          No credit card required · First tour free
        </p>
      </section>

      {/* Feature cards */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3">3D Tour Creator</h2>
            <p className="text-[var(--muted-foreground)] mb-6">
              Upload a walkthrough video and get an interactive Gaussian Splat 3D
              tour. Share a link for MLS listings, Zillow, or email blasts.
              Buyers explore on any device — no app needed.
            </p>
            <ul className="space-y-2 text-sm text-[var(--muted-foreground)]">
              {["Upload MP4 or MOV walkthrough", "AI generates photorealistic 3D scene", "Shareable public link in 5–10 min", "Embeddable in any website or MLS"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3">Reel Creator</h2>
            <p className="text-[var(--muted-foreground)] mb-6">
              Upload property photos or clips. Pick a style — cinematic, luxury,
              modern, or warm. Get a polished 9:16 MP4 ready for Instagram Reels,
              TikTok, or YouTube Shorts.
            </p>
            <ul className="space-y-2 text-sm text-[var(--muted-foreground)]">
              {["Upload photos or short video clips", "Choose cinematic style preset", "AI generates smooth motion video", "Download MP4 for social posting"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Social proof / CTA */}
      <section className="bg-[var(--muted)] border-y border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to stand out?</h2>
          <p className="text-[var(--muted-foreground)] mb-8 max-w-lg mx-auto">
            Join agents already using Nook to close listings faster with
            immersive 3D tours and scroll-stopping social content.
          </p>
          <SignUpButton mode="modal">
            <button className="bg-[var(--primary)] text-[var(--primary-foreground)] px-8 py-3.5 rounded-xl text-base font-medium hover:opacity-90 transition-opacity">
              Create your first tour free →
            </button>
          </SignUpButton>
        </div>
      </section>
    </div>
  );
}
