import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/tour/(.*)",
  "/r/(.*)",
  "/viewer",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  // PWA manifest + icons: browsers fetch these unauthenticated (install-check, tab icon on the
  // public marketing/share pages) — without this they 307 to /sign-in, which silently breaks
  // installability instead of erroring loudly.
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icons/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/"],
};
