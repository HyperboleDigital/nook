import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});

export const PLANS = {
  starter: {
    name: "Starter",
    price: 49,
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    tours: 10,
    reels: 20,
  },
  pro: {
    name: "Pro",
    price: 99,
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    tours: 30,
    reels: -1, // unlimited
  },
} as const;
