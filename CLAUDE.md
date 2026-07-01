@AGENTS.md

# Nook — Project Context for Claude

## What this app is
Nook is a SaaS for real estate agents. Three core features:
1. **3D Tours** — agent uploads a property walkthrough video → GPU processes it into a Gaussian Splat (.ply) → agent shares a 3D walkthrough link with clients
2. **Reels** — agent generates a cinematic 9:16 social media video from a property photo (via Higgsfield AI)
3. **Room Restyle** — agent uploads a room photo → AI (Gemini "Nano Banana" image model) restages it with new furniture/decor → each swapped item is matched to a real, buyable product ("shop the look") via Google Lens + retailer APIs → agent shares a client link. This is the feature under active development.

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
- **Room Restyle**: Gemini image model (`gemini-2.5-flash-image` "Nano Banana", pro variant `gemini-3-pro-image-preview`) for compositing; `sharp` for image canonicalization; Google Lens + SerpApi / Unwrangle / Rainforest for product matching
- **Billing**: Stripe (plans: free / starter / pro)

---

## Current state (as of July 2026)
All three pipelines are wired and deployed. **Room Restyle is the feature under active development** (most recent work). Storage is Vercel Blob throughout (Supabase free tier hard-caps at 50 MB; property videos are 200 MB–2 GB).

**What works:**
- Clerk auth with route protection via `src/proxy.ts`
- 3D Tours: two-step upload (browser → Vercel Blob CDN → Modal worker), polling, SuperSplat viewer, `public_slug` share link
- Higgsfield Reels confirmed working
- Room Restyle: full wizard flow (upload room → pick item → find/pick product → AI recompose → shop-the-look result with buy links + running total), Swiss-Minimalism design system, clipboard paste, auto-search on item select, expandable staged items with saved options, shareable client link

**Not yet tested end-to-end:**
- Full video upload → Modal job → PLY → viewer flow (pipeline is wired but no real test upload completed yet)

**Pending / known issues:**
- Clerk keys are still `pk_test_` (dev mode) — needs production keys before real users
- Supabase Storage bucket `nook-uploads` still exists but is no longer used
- No usage/quota enforcement on free plan yet
- Restyle: hotspot dots on the render deferred (detection boxes are from the original image, don't line up with the re-rendered room)

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

### Room Restyle — API routes (`src/app/api/restyle/`)
- `route.ts` — POST, create a restyle project from a room photo. `sharp` canonicalizes (EXIF-rotate + downscale to 1536px), uploads original to Blob, inserts `restyles` row. No AI call at create.
- `detect/route.ts` — POST, Gemini detects editable objects in the room (JSON `{imageUrl,restyleId}` or multipart). Caches `detected_objects` on the project (detection is non-deterministic, so it's persisted for a stable item list).
- `[id]/product/route.ts` — POST, stage a product as a reference edit. 3 input shapes: JSON `{url}` (pasted retailer link), JSON `{token}` (SerpApi immersive token → resolved URL), or multipart image (user's own screenshot). `targetLabel` in the body force-targets a specific detected item (the wizard sends this so "Use this in the room" replaces the right object). Auto-decides replace-vs-add. Does NOT render.
- `[id]/visual-search/route.ts` — POST, screenshot → find the actual product via Google Lens, falling back to keyword "similar" search; Gemini scores candidates 0–10 against the photo. Text-only path (`query`) for "Describe it". Does NOT render.
- `[id]/edits/route.ts` — POST add / PATCH toggle / DELETE a change layer (multipart). Does NOT render.
- `[id]/generate/route.ts` — POST, renders the current ACTIVE edit set (calls `recompose`).
- `[id]/items/route.ts` — item list helper.
- `restyles/route.ts`, `restyles/[id]/route.ts` — list/read restyle projects (plural — the gallery/index endpoints).

### Room Restyle — pages/components (`src/app/(app)/restyle/`)
- `page.tsx` — restyle projects gallery.
- `new/page.tsx` — upload/paste a room photo (clipboard paste supported; "Take a photo" only on phones, "Choose a photo" on desktop).
- `[id]/page.tsx` — project shell; renders wizard or result.
- `[id]/RestyleWizard.tsx` — the editing wizard: pick a detected item, source a product (auto-search on select, photo/describe tabs, always-visible candidate list), expandable staged items showing current pick + saved options + replace/remove.
- `[id]/RestyleResult.tsx` — canvas + "Shop this look" product panel (cards with image/retailer/price/buy link, running total), compare slider, download, options strip, Edit actions.
- `[id]/useRestyleWorkspace.ts` — client workspace hook (search, pickCandidate, staging, generate). `candidatesByLabel` cache lives in localStorage (`nook-restyle-${id}`, 24h TTL).
- `[id]/ui.tsx` — restyle UI primitives: `Button`, `IconButton`, `ProductCard` (cva + lucide-react icons, Swiss-Minimalism style).
- `[id]/shared.ts` — restyle tokens/helpers.

### Room Restyle — libraries (`src/lib/`)
- `gemini.ts` — Gemini client. Key exports: `restyleRoom`, `composeEdits` (multi-edit compositor), `detectObjects`, `describeProduct`/`describeProductImages` (recover dimensions/proportions for accurate scale), `describeScreenshotForSearch`, `scoreImageMatches`. Models: `GEMINI_IMAGE_MODEL` = `gemini-2.5-flash-image`, `GEMINI_IMAGE_PRO_MODEL` = `gemini-3-pro-image-preview`, `GEMINI_VISION_MODEL` = `gemini-2.5-flash`.
- `restyle-render.ts` — `uploadImage` (Blob upload chokepoint — see SharedArrayBuffer gotcha), `recompose` (caches renders per active-edit signature in `restyle_renders`), `closestAspect`.
- `product.ts` — retailer product detail (Unwrangle for Wayfair/Walmart/Home Depot, Rainforest for Amazon).
- `shopping-search.ts` — SerpApi Google Lens visual match + Google Shopping/Amazon/Walmart/HD keyword search; `resolveImmersiveToken`.
- `file-buf.ts` — `fileToBuffer` (stream-read a File/Blob) and `toUnsharedBuffer` (strip SharedArrayBuffer backing before a fetch/Blob-put body — see gotcha).

### Restyle DB tables (Supabase)
- `restyles` — project (original_url, current_url, width/height, detected_objects, title, user_id, public_slug)
- `restyle_edits` — change layers (kind `item`/`add`, target_label, reference_url/desc, buy_url, product_title/price, active, position)
- `restyle_renders` — cached renders keyed by `signature` (comma-joined active edit ids) for instant toggle-back

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
PRODUCT_API_KEY                     Unwrangle — product detail for Wayfair/Walmart/Home Depot links (see src/lib/product.ts)
RAINFOREST_API_KEY                  Rainforest API — fast Amazon product detail (Amazon links go here, not Unwrangle)
SERPAPI_API_KEY                     SerpApi — Google Lens visual match + Google Shopping/Amazon/Walmart/HD search (see src/lib/shopping-search.ts)
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

## Room Restyle flow (end-to-end)
1. Agent goes to `/restyle/new`, uploads or pastes a room photo → `POST /api/restyle` (sharp canonicalizes, stores original, creates project) → redirect to `/restyle/[id]`.
2. `POST /api/restyle/detect` finds editable objects; the item chips are cached on the project.
3. Agent picks an item to swap/add. The wizard auto-searches for products (`visual-search` text path) or the agent uploads a photo / pastes a retailer link.
4. Agent picks a product → `POST /api/restyle/[id]/product` stages it as a reference edit (with `targetLabel` so it replaces the right object). Staged items are expandable and keep their saved options.
5. Agent hits generate → `POST /api/restyle/[id]/generate` → `recompose` composites all active edits with Gemini, uploads the render (cached per active-edit signature).
6. Result screen shows the restyled room + a "Shop this look" panel: each swapped item as a card with retailer, price, and buy link, plus a running total. Compare slider + download. Shareable client link via `public_slug`.

---

## Important gotchas
- `src/proxy.ts` (not `middleware.ts`) — Next.js 16 picks it up as middleware. Unauthenticated requests to protected routes get a 404 HTML page (Clerk's `protect-rewrite`), not a 401.
- Supabase free tier = 50 MB hard upload cap. **Do not use Supabase Storage for binary files.** DB only.
- Modal `@modal.web_endpoint` is deprecated — use `@modal.fastapi_endpoint`.
- The `supabase` pip package is no longer in the Modal worker (removed when switching to Vercel Blob).
- Vercel body size limit is 4.5 MB — all large file operations must go direct to Vercel Blob from the browser.
- **"SharedArrayBuffer is not allowed" on Vercel is an undici/fetch error, NOT a sharp error.** It's thrown by undici's fetch body validation (`allowShared:false`) when a Buffer whose `.buffer` is a genuine SharedArrayBuffer is used as a fetch body. Vercel Blob's `put()` sends the body via fetch, and on Vercel's Linux runtime `sharp`'s `toBuffer()` output is backed by a SharedArrayBuffer (libvips memory pool). It never reproduces on macOS. **Fix:** wrap any sharp-derived (or pool-backed) buffer in `toUnsharedBuffer()` (`src/lib/file-buf.ts`) before passing it to `put()`/fetch. Already applied at the single chokepoint `uploadImage()` in `src/lib/restyle-render.ts`. Do NOT chase this in sharp's *inputs* — that's the wrong layer. (`src/app/api/reels/route.ts` has the same latent pattern if it ever uploads a sharp-derived buffer.)
- Restyle design system is **Swiss Minimalism**: `--primary: #7C3AED` (violet), `--radius: 0px` (sharp corners), no shadows (border-only depth), 8px grid, tight `letter-spacing: -0.02em` headings, single accent. Tokens in `src/app/globals.css`. Use `lucide-react` icons, never emoji. UI primitives (`Button`/`IconButton`/`ProductCard`) live in `src/app/(app)/restyle/[id]/ui.tsx` and use `cva`. `cn()` helper in `src/lib/utils.ts`.
- Detection is non-deterministic — always read the item list from the persisted `restyles.detected_objects`, never re-detect on each load (the chips would change every time).
