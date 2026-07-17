import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";
import { Check } from "lucide-react";

// Room Restyle is the whole product now (3D tours / Reels are cut), so the plans are framed around
// restyles + how deep "shop the look" goes. The one gate that's real in code today is product-match
// depth: free returns a single match per item (see plan.ts searchTierForPlan / SearchTier), paid
// unlocks the full Lens + keyword search across retailers. Prices/limits below are a starting point
// — easy to tweak once the quota is finalized.
const plans = [
  {
    name: "Free",
    price: 0,
    description: "Try Nook on a room or two.",
    features: [
      "3 room restyles / month",
      "Tap to swap, restyle, or remove any item",
      "1 product match per item",
      "Shareable client links",
      "Standard resolution",
    ],
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Starter",
    price: 49,
    description: "For active agents and stagers.",
    features: [
      "Unlimited room restyles",
      "Full shop-the-look — every item matched across retailers",
      "Remove the Nook watermark",
      "HD downloads",
      "Email support",
    ],
    cta: "Start Starter",
    highlight: true,
  },
  {
    name: "Pro",
    price: 99,
    description: "For teams and top producers.",
    features: [
      "Everything in Starter",
      "Priority generation",
      "Highest-fidelity restyles",
      "Custom branding on client links",
      "Priority support",
    ],
    cta: "Go Pro",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
      <div className="text-center mb-14">
        <h1 className="text-4xl font-bold tracking-[-0.02em] mb-4">Simple, honest pricing</h1>
        <p className="text-[var(--muted-foreground)] text-lg">
          Pay monthly. Cancel anytime. No hidden fees.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5 items-start">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-3xl border p-8 flex flex-col shadow-[var(--shadow-soft)] ${
              plan.highlight
                ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] md:-translate-y-2"
                : "border-[var(--border)] bg-[var(--card)]"
            }`}
          >
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold opacity-80">{plan.name}</span>
                {plan.highlight && (
                  <span className="rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                    Most popular
                  </span>
                )}
              </div>
              <div className="text-4xl font-bold tracking-tight mb-2">
                ${plan.price}
                <span className="text-base font-normal opacity-60">/mo</span>
              </div>
              <p className={`text-sm ${plan.highlight ? "opacity-80" : "text-[var(--muted-foreground)]"}`}>
                {plan.description}
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-px ${
                      plan.highlight ? "bg-white/20 text-white" : "bg-[var(--accent-soft)] text-[var(--accent)]"
                    }`}
                  >
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  <span className={plan.highlight ? "" : "text-[var(--foreground)]"}>{f}</span>
                </li>
              ))}
            </ul>

            {plan.price === 0 ? (
              <SignUpButton mode="modal">
                <button
                  className={`w-full py-3 rounded-full font-medium text-sm transition-opacity hover:opacity-90 ${
                    plan.highlight ? "bg-white text-[var(--primary)]" : "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  }`}
                >
                  {plan.cta}
                </button>
              </SignUpButton>
            ) : (
              <Link
                href="/dashboard"
                className={`w-full py-3 rounded-full font-medium text-sm text-center transition-opacity hover:opacity-90 block ${
                  plan.highlight ? "bg-white text-[var(--primary)]" : "bg-[var(--primary)] text-[var(--primary-foreground)]"
                }`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-[var(--muted-foreground)] mt-10">
        Running a brokerage or a bigger team?{" "}
        <a href="mailto:hello@hyperboledigital.com" className="underline hover:text-[var(--foreground)]">
          Get in touch
        </a>{" "}
        for volume pricing.
      </p>
    </div>
  );
}
