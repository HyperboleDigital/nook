@AGENTS.md

# Nook — Project Context for Claude

## What this app is
Nook is a SaaS for real estate agents. Two core features:
1. **3D Tours** — agent uploads a property walkthrough video → GPU processes it into a Gaussian Splat (.ply) → agent shares a 3D walkthrough link with clients
2. **Reels** — agent generates a cinematic 9:16 social media video from a property photo (via Higgsfield AI)

Live app: https://nook-lime.vercel.app  
GitHub: https://github.com/HyperboleDigital/nook

---

## Stack
- **Framework**: Next.js 16 (App Router, `src/` dir, TypeScript)
- **Auth**: Clerk (`src/proxy.ts` is the middleware — Next.js 16 picks this up, NOT `middleware.ts`)
- **Database**: Supabase (DB only — no Supabase Storage, tables: `users`, `tours`, `reels`)
- **File storage**: Vercel Blob (videos up to 2 GB, PLY output files) — `BLOB_READ_WRITE_TOKEN` required
- **GPU processing**: Modal.com serverless GPU (`modal/worker.py`) — deployed as `nook-3dgs`
- **3D pipeline**: Nerfstudio `splatfacto` on Modal A10 GPU (~35 min, ~$0.73/scan)
- **3D viewer**: SuperSplat (`superspl.at/editor?load=<ply_url>`) — display only, not a processor
- **Reels**: Higgsfield AI API
- **Billing**: Stripe (plans: free / starter / pro)

---

## Current state (as of June 2026)
The full pipeline is wired and deployed. Last major change: switched storage from Supabase to Vercel Blob (Supabase free tier hard-caps at 50 MB; property videos are 200 MB–2 GB).

**What works:**
- Clerk auth with route protection via `src/proxy.ts`
- Two-step upload: browser → Vercel Blob CDN (via `@vercel/blob/client`) → triggers Modal worker
- Modal GPU worker: Nerfstudio pipeline (COLMAP → splatfacto → PLY export → Vercel Blob upload → HMAC callback)
- Tour detail page polls `/api/tours/[id]` every 10s until status = `complete`
- SuperSplat viewer + "Edit in SuperSplat" button on completed tours
- Share link via `public_slug`
- Reels page (Higgsfield) exists in code

**Not yet tested end-to-end:**
- Full video upload → Modal job → PLY → viewer flow (pipeline is wired but no real test upload completed yet)
- Higgsfield Reels confirmed working

**Pending / known issues:**
- Clerk keys are still `pk_test_` (dev mode) — needs production keys before real users
- Supabase Storage bucket `nook-uploads` still exists but is no longer used
- No usage/quota enforcement on free plan yet

---

## Key files

### API routes (`src/app/api/`)
- `tours/upload-url/route.ts` — POST, uses Vercel Blob `handleUpload` to generate signed upload token
- `tours/route.ts` — POST, creates tour in DB + fires Modal worker (fire-and-forget)
- `tours/[id]/route.ts` — GET, reads tour from Supabase DB
- `webhooks/modal/route.ts` — POST, HMAC-validated callback from Modal; updates tour status + ply_url
- `webhooks/clerk/route.ts` — syncs Clerk users to Supabase `users` table
- `reels/route.ts` — POST, triggers Higgsfield generation
- `checkout/route.ts` — Stripe checkout session

### Pages (`src/app/(app)/`)
- `tours/new/page.tsx` — upload form using `@vercel/blob/client` `upload()` with progress bar
- `tours/[id]/page.tsx` — client component, polls every 10s, shows SuperSplat viewer on complete

### Utilities
- `src/lib/supabase.ts` — exports `supabase` (anon) and `supabaseAdmin` (service role)
- `src/lib/luma.ts` — Luma Agents API client (ray-3.2, 2D video only — for future Reels use)
- `src/proxy.ts` — Clerk middleware (public routes: `/`, `/pricing`, `/tour/(.*)`, `/api/webhooks/(.*)`)

### Modal worker
- `modal/worker.py` — Nerfstudio GPU pipeline, deployed to `hello-74996` workspace
- Endpoint: `https://hello-74996--nook-3dgs-process-video.modal.run`
- Secrets in Modal: `MODAL_WEBHOOK_SECRET`, `NOOK_APP_URL`, `BLOB_READ_WRITE_TOKEN`

---

## Environment variables
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   Clerk (still test keys)
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
NEXT_PUBLIC_SUPABASE_URL            https://gxmditznqwgnsyxposxv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
BLOB_READ_WRITE_TOKEN               Vercel Blob — store_a2BDOznYyMAKZ6d6
MODAL_WEBHOOK_URL                   https://hello-74996--nook-3dgs-process-video.modal.run
MODAL_WEBHOOK_SECRET                2bda05a9cc6a5ba9c64886fb0d07b0b817e2c7d6
LUMA_API_KEY                        for future Reels use
HIGGSFIELD_API_KEY
GEMINI_API_KEY                      Google AI Studio — Room Restyle (Nano Banana image model)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID
STRIPE_PRO_PRICE_ID
NEXT_PUBLIC_APP_URL                 https://nook-lime.vercel.app
```

---

## 3D Tour flow (end-to-end)
1. Agent goes to `/tours/new`, enters title, drags in a video
2. Browser calls `POST /api/tours/upload-url` → gets Vercel Blob upload token
3. Browser uploads video directly to Vercel Blob CDN (progress bar, up to 2 GB)
4. Browser calls `POST /api/tours` with `{title, videoUrl}` → tour created (status: `pending`)
5. Next.js fires Modal worker async with `{video_url, tour_id, callback_url}`
6. Modal A10 GPU: downloads video → COLMAP → splatfacto 7000 iter → PLY export → upload to Vercel Blob → HMAC callback to `/api/webhooks/modal`
7. Tour updated to `status: complete`, `ply_url` set to Vercel Blob URL
8. Tour detail page detects `complete`, shows SuperSplat viewer iframe

---

## Important gotchas
- `src/proxy.ts` (not `middleware.ts`) — Next.js 16 picks it up as middleware. Unauthenticated requests to protected routes get a 404 HTML page (Clerk's `protect-rewrite`), not a 401.
- Supabase free tier = 50 MB hard upload cap. **Do not use Supabase Storage for binary files.** DB only.
- Modal `@modal.web_endpoint` is deprecated — use `@modal.fastapi_endpoint`.
- The `supabase` pip package is no longer in the Modal worker (removed when switching to Vercel Blob).
- Vercel body size limit is 4.5 MB — all large file operations must go direct to Vercel Blob from the browser.
