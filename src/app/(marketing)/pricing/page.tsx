import Link from "next/link";
import { SignUpButton } from "@clerk/nextjs";

const plans = [
  {
    name: "Free",
    price: 0,
    description: "Try Nook with your first listing.",
    tours: 1,
    reels: 2,
    features: ["1 3D tour", "2 Reels", "Public shareable links", "Standard resolution"],
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Starter",
    price: 49,
    description: "For active agents with regular listings.",
    tours: 10,
    reels: 20,
    features: ["10 3D tours/mo", "20 Reels/mo", "Public shareable links", "HD resolution", "Remove Nook watermark", "Email support"],
    cta: "Start Starter",
    highlight: true,
  },
  {
    name: "Pro",
    price: 99,
    description: "For top producers and teams.",
    tours: 30,
    reels: -1,
    features: ["30 3D tours/mo", "Unlimited Reels", "Priority processing", "4K resolution", "Custom branding", "Priority support", "$3/extra tour"],
    cta: "Go Pro",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-24">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Simple, honest pricing</h1>
        <p className="text-[var(--muted-foreground)] text-lg">
          Pay monthly. Cancel anytime. No hidden fees.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border p-8 flex flex-col ${
              plan.highlight
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-[var(--border)] bg-[var(--card)]"
            }`}
          >
            <div className="mb-6">
              <div className="text-sm font-medium opacity-70 mb-1">{plan.name}</div>
              <div className="text-4xl font-bold mb-2">
                ${plan.price}
                <span className="text-base font-normal opacity-60">/mo</span>
              </div>
              <p className={`text-sm ${plan.highlight ? "text-slate-300" : "text-[var(--muted-foreground)]"}`}>
                {plan.description}
              </p>
            </div>

            <ul className="space-y-2.5 mb-8 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <span className={plan.highlight ? "text-green-400" : "text-green-500"}>✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {plan.price === 0 ? (
              <SignUpButton mode="modal">
                <button className={`w-full py-3 rounded-xl font-medium text-sm transition-opacity hover:opacity-90 ${
                  plan.highlight
                    ? "bg-white text-slate-900"
                    : "bg-[var(--primary)] text-[var(--primary-foreground)]"
                }`}>
                  {plan.cta}
                </button>
              </SignUpButton>
            ) : (
              <Link
                href="/dashboard"
                className={`w-full py-3 rounded-xl font-medium text-sm text-center transition-opacity hover:opacity-90 block ${
                  plan.highlight
                    ? "bg-white text-slate-900"
                    : "bg-[var(--primary)] text-[var(--primary-foreground)]"
                }`}
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-[var(--muted-foreground)] mt-8">
        Need more? Add extra tours at $3 each or contact us for brokerage plans.
      </p>
    </div>
  );
}
