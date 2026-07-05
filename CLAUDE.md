@AGENTS.md

# Nook — Project Context for Claude

## What this app is
Nook is a SaaS for real estate agents. Three core features:
1. **3D Tours** — agent uploads a property walkthrough video → GPU processes it into a Gaussian Splat (.ply) → agent shares a 3D walkthrough link with clients
2. **Reels** — agent generates a cinematic 9:16 social media video from a property photo (via Higgsfield AI)
3. **Room Restyle** — agent uploads a room photo → taps a detected item (or a "+ Add" chip) on a canvas-first editor → sources it via a pasted retailer link, an inspo photo, or a description → AI (Gemini "Nano Banana" image model) restages the room → each swapped item is matched to a real, buyable product ("shop the look") via Google Lens + retailer APIs, searched only AFTER generate (not the moment a photo is uploaded) → agent shares a client link. This is the feature under active development.

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
- Room Restyle: canvas-first editor (room photo is the centerpiece, tap a hotspot/chip to source), server-persisted product search deferred until after generate, "Similar items" + "Shop this look" + "Queued changes" panels, shareable client link. See the dedicated section below — this was substantially rebuilt in the most recent session (step wizard → canvas editor).

**Not yet tested end-to-end:**
- Full video upload → Modal job → PLY → viewer flow (pipeline is wired but no real test upload completed yet)
- The canvas-first Restyle editor has not been click-tested in a real browser by Claude (no auth available in that session) — verified only via typecheck/lint/build/dev-server smoke tests. Exercise the real flow before assuming it's fully correct.

**Pending / known issues:**
- Clerk keys are still `pk_test_` (dev mode) — needs production keys before real users
- Supabase Storage bucket `nook-uploads` still exists but is no longer used
- No usage/quota enforcement on free plan yet
- **`supabase/migrations/013_restyle_searches.sql` needs to be applied manually** (no Supabase CLI is configured in this project — migrations are pasted into the Supabase SQL editor by hand). Until it's run, `GET /api/restyle/[id]/searches` 500s harmlessly (the client swallows the error and just starts with an empty search cache) — search/pick still works, results just won't persist across reloads.
- **`supabase/migrations/014_restyle_room_type.sql` also needs manual application.** Adds a nullable `room_type` column to `restyles`, set by the capture wizard's room-type picker (`/restyle/new`). The insert in `POST /api/restyle` only includes `room_type` when a value was actually picked, so uploads work fine even before this migration is applied — the field is just silently dropped until then.
- **`supabase/migrations/015_restyle_placement.sql` also needs manual application — BEFORE deploying the pin-placement code.** Adds `restyle_edits.placement` jsonb (`{x, y, note}`, 0–1000 box_2d space, set by the add-item tap-to-place pin) and drops the dead `restyle_versions` table. Unlike 014, this one is not optional-at-runtime: `PATCH /api/restyle/[id]/edits` writes the `placement` column directly and will 500 on an unknown column.
- Restyle hotspots on a *render* are an approximation, not real detection: object positions are only ever detected on the original photo (`restyles.detected_objects`), so a hotspot on the styled result reuses that item's ORIGINAL box_2d position. Correct for the common case (a swap usually stays roughly where the original piece was) but can drift if Nano Banana repositions/resizes furniture significantly. A pinned "add" item uses a small box synthesized around its tap-to-place pin instead; an unpinned add gets no hotspot and shows only in "Shop this look".
- **The render is a canvas, not a dead end.** `useRestyleWorkspace`'s `canvasHotspots` puts a hotspot on EVERY detected item on whichever image is displayed (original or a render), each in one of three states: `idle` (unchanged — tap to swap), `queued` (staged but not in the pictured image — tap for the `QueuedHotspotPopover` teaser), `placed` (the change IS in the pictured image — tap for the priced `HotspotPopover`). `placed` is derived from the displayed render's `signature` (`shownProductIds`), which is always empty while `viewingOriginal` — so the "never show placed/priced UI on the original" rule (below) holds automatically instead of needing a second code path. This means a user can keep tapping unchanged items on a render to keep swapping/adding and regenerating — `recompose` always composites fresh from the ORIGINAL photo plus the current active-edit set, so iterating from a render needed no backend change, only this hotspot model. There's no chip row anymore — tapping the photo directly (via `canvasHotspots`) is the only sourcing entry point; a floating "+ Add" button lives on the canvas itself (`RestyleCanvas.tsx`) for new items.
- **Hotspot/pin popovers must clamp their horizontal position in PIXELS, not just percent of the image.** A percent-only clamp (e.g. `min(max(cx, 18), 82)`) assumes the rendered image is wide enough that half the popover's fixed width is a small percentage of it — that assumption breaks on a narrower image (portrait photo, smaller viewport, a side-by-side desktop layout) and the fixed-width card clips off the edge of the `overflow-hidden` canvas frame. Fix pattern (see `HotspotPopover.tsx`, `QueuedHotspotPopover.tsx`, `PinPlacementLayer.tsx`): `left: clamp(HALF_WIDTH_PX, ${cx}%, calc(100% - HALF_WIDTH_PX))` — CSS `clamp()` correctly compares mixed px/% units, so the card's edge never gets closer than `HALF_WIDTH_PX` to either side of the frame regardless of its actual width.
- **Don't put drag-driven state in `useRestyleWorkspace` — it re-renders the entire editor tree.** The compare slider used to live in the shared hook and called `setCompare` on every raw `pointermove`, which re-rendered ShopLook/QueuedChanges/GenerateBar/etc. on every pixel of drag (the hook backs the whole `RestyleStudio` subtree, not just the canvas), which is what made it feel laggy. Fixed by moving `compare`/`dragging`/`imgWrapRef`/`sliderHandlers` into local state in `RestyleCanvas.tsx` (nothing else read them) and throttling `setCompare` to at most once per animation frame via a `requestAnimationFrame` guard. If something is only read by one component, keep its state there — don't default to putting it in the shared hook just because everything else lives there.

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
- `upload-url/route.ts` — POST, signed Vercel Blob upload token for room/inspo photos (`handleUpload`, mirrors `tours/upload-url/route.ts`). The browser uploads the actual image bytes straight to Blob using `@vercel/blob/client`'s `upload()`, decoupled from our own functions — closing the tab mid-transfer just loses that unfinished upload, never a half-created DB row. `route.ts` and `[id]/product/route.ts` below only ever receive the resulting blob URL as JSON.
- `route.ts` — POST, create a restyle project from an already-uploaded room photo (`{photoUrl, title?, room_type?}` JSON — no file bytes in this request). Fetches the blob, `sharp` canonicalizes (EXIF-rotate + downscale to 1536px), re-uploads the canonical copy, best-effort deletes the client's raw upload, inserts `restyles` row, then fires object detection in the background via Next's `after()` using the buffer already in memory (no refetch) — chips are usually ready by the time the editor loads instead of a separate client-triggered detect call.
- `detect/route.ts` — legacy/fallback path: Gemini detects editable objects in the room (JSON `{imageUrl,restyleId}` or multipart). The client only calls this if the background detection from `route.ts` hasn't landed after ~20s of polling. Caches `detected_objects` on the project (detection is non-deterministic, so it's persisted for a stable item list).
- `[id]/product/route.ts` — POST, stage a product/photo as a reference edit. Input shapes, all JSON: `{url}` (pasted retailer link — a confirmed real product), `{token}` (SerpApi immersive token → resolved URL), or `{imageUrl}` (an inspo photo the client already uploaded to Blob via `upload-url/route.ts` — staged as a reference with **no buy link yet**; search is deferred, see below). `targetLabel` force-targets a specific slot; `replaceEditId` deletes a superseded edit (e.g. an inspo photo now replaced by a real pick) in the same request. Auto-decides replace-vs-add via `matchDetected`. Does NOT render. Shared staging logic (insert + single-active-per-label dedupe) lives in `src/lib/restyle-edits.ts`'s `stageEdit()`.
- `[id]/visual-search/route.ts` — POST, find buyable products via Google Lens + keyword search, Gemini-scored against the target image. Three input shapes: `image` (file), `imageUrl` (an already-staged/cropped photo — used for the deferred post-generate search, see below), or `query` (text, from "Describe it"). Responds fast with unscored results, then finishes Gemini scoring + resolves Wayfair immersive tokens in the background via `after()`, persisting the final set to `restyle_searches` (see DB tables). Does NOT render.
- `[id]/searches/route.ts` — GET, the persisted search results for a project (optional `?label=`). Replaces what used to be a client-side localStorage cache.
- `[id]/edits/route.ts` — POST add / PATCH toggle / DELETE a change layer (multipart). Does NOT render.
- `[id]/generate/route.ts` — POST, renders the current ACTIVE edit set (calls `recompose`). **This is also when shopping search actually happens for inspo-only items** — see "Deferred search" below.
- `[id]/items/route.ts` — item list helper (custom/not-detected items).
- `restyles/route.ts`, `restyles/[id]/route.ts` — list/read restyle projects (plural — the gallery/index endpoints).

### Room Restyle — pages/components (`src/app/(app)/restyle/`)
- `page.tsx` — restyle projects gallery.
- `new/page.tsx` — upload/paste a room photo (clipboard paste supported; "Take a photo" only on phones, "Choose a photo" on desktop). Client-side `downscaleImage()` before upload (see `src/lib/image-client.ts`).
- `[id]/page.tsx` — thin shell: header (back link, title input) + `<RestyleStudio>`. No more wizard/result fork — one screen, `displayUrl` decides what the canvas shows.
- `[id]/useRestyleWorkspace.ts` — the single state hook everything else reads from. Key concepts: `sourcing` (the item currently being sourced — `{label, mode: "swap"|"add", view: "compose"|"similar", stagedEditId, lastStaged?}`, cleared entirely on panel close so stale banners can't outlive the item they describe), `searches` (per-label search state hydrated from `GET /searches` and updated in place as scoring finishes), `canvasHotspots` (unified hotspot list for whichever image is on screen — see gotchas), `viewingOriginal`/`stagedItems`/`productEdits`/`inspoEdits` (derived — see gotchas for what each one filters by). Picking a candidate (`pickCandidate`) is optimistic: the edit appears staged immediately using the search result's own thumbnail/title/price, reconciled or rolled back once the server responds. `toggle` flips an edit's `active` flag alone (no render); `toggleAndRegenerate` (used by the per-item on/off controls in `HotspotPopover`/`ShopLook`) chains `toggle` then `generate()` so flipping an item off/on takes effect immediately — a previously-seen combination is a free cache hit via `restyle_renders`' signature cache, a new one pays a real render. The before/after compare slider's state (`compare`/`imgWrapRef`/`sliderHandlers`) is NOT in this hook — it lives locally in `RestyleCanvas.tsx` (see gotchas) since nothing else needs it.
- `[id]/RestyleStudio.tsx` — layout owner. Desktop: canvas on the left (no chip row — tapping the photo is the only way to source an item, see canvasHotspots), a **persistent right rail** that defaults to `QueuedChanges` (viewing the original — nothing generated yet) or `ShopLook` (viewing a render), and swaps to `SourcePanel`/`SimilarItemsPanel` while `sourcing` is open. Mobile: same content stacks inline below the canvas; sourcing uses a bottom-sheet overlay instead (no room for a persistent rail).
- `[id]/RestyleCanvas.tsx` — the room photo, treated as a live canvas whether it's the original or a render (see the `canvasHotspots` gotcha — a render is not a dead end, every item stays tappable). Renders `ObjectHotspots` + whichever popover matches a tapped hotspot's state (`QueuedHotspotPopover` for `queued`, `HotspotPopover` for `placed` — thumbnail/price/Show-similar/Buy), compare slider, share/download.
- `[id]/ObjectHotspots.tsx` — circular tap targets from `box_2d`, positioned as percentages, styled per-hotspot state (idle/queued/placed — see gotchas). Solid white backing disc under every idle marker (a plain small dot disappears against a photo). Runs a pairwise separation pass so hotspots detected close together (e.g. a vase on a coffee table) don't overlap into one unreachable blob.
- `[id]/SourcePanel.tsx` — the link/photo/describe sourcing form, for an EMPTY slot only. Shows a `CroppedThumb` of the actual item being replaced next to the label. Photo staging is optimistic (see `stagePhoto` gotcha).
- `[id]/SimilarItemsPanel.tsx` — clean product-card list ("Recommended based on X") for a slot that already has something placed — the "Show similar"/"Find buyable matches" destination. No tabs; auto-triggers a search against the staged item's own reference photo if one hasn't run yet.
- `[id]/CroppedThumb.tsx` — crops a region out of a full photo using CSS position/size math only (no canvas/server round-trip) — used to show "here's the actual item" next to a label instead of just text.
- `[id]/QueuedChanges.tsx` — right-rail default while viewing the original: pending swaps/adds, explicitly framed as "not in the photo yet" (do not conflate with `ShopLook` — see gotchas, this distinction fixed a real bug). Collapsed by default behind an "n changes queued" toggle — each item already has a green-checkmark hotspot on the canvas, so this list is a secondary "review everything at once" view, not the primary way to see what's queued.
- `[id]/QueuedHotspotPopover.tsx` — teaser anchored to a `queued` hotspot (thumbnail, "Queued" badge, Change/Remove) — the on-canvas counterpart to `QueuedChanges`, same "not in the photo yet" framing, never price/Buy.
- `[id]/ShopLook.tsx` — right-rail default while viewing a render: exactly what's actually shoppable in the CURRENT image. Real products get a full card (retailer/price/Buy/Replace); inspo-only items get a compact "from your photo" card with a "Find buyable matches" button that opens `SimilarItemsPanel` — no inline search-alternatives list here (that used to live in this panel and read as "search results," not "your room").
- `[id]/GenerateBar.tsx` — sticky bottom bar; overflow menu (⋯) for "Empty the room" / "Start from original".
- `[id]/VersionsStrip.tsx` — render-history thumbnails.
- `[id]/ui.tsx` — Warm Modern primitives (cva + lucide-react): `Button` (variants include `accent`/`accentSoft` for buy/product actions), `IconButton`, `ProductCard`, `Sheet`/`SheetChrome` (mobile bottom-sheet; desktop docking is custom-built in `RestyleStudio`, not `Sheet`'s job anymore), `Chip`, `Spinner`, `Input`, `StatusBanner`, `Skeleton`/`SkeletonProductCard`, `ProgressOverlay`, `SegmentedTabs`, `SectionLabel`, `shopSummary`/`ShopSummaryPill` (the "n items · from $X" total, shared by `ShopLook` and the canvas's floating pill).

### Room Restyle — libraries (`src/lib/`)
- `gemini.ts` — Gemini client. Every call now has a real fetch timeout (`AbortSignal.timeout`, 20s vision / 90s image-gen) — previously unbounded, relying only on the route's `maxDuration`. Key exports: `restyleRoom`, `composeEdits` (multi-edit compositor), `detectObjects`, `describeProduct`/`describeProductImages` (recover dimensions/proportions for accurate scale), `describeScreenshotForSearch` (also extracts a literal product title/brand if legible text is visible — stronger search signal than a generic description for niche/branded items), `locateProductPhoto` (crops UI chrome out of a screenshot before it pollutes Lens matching), `scoreImageMatches`. Models: `GEMINI_IMAGE_MODEL` = `gemini-2.5-flash-image`, `GEMINI_IMAGE_PRO_MODEL` = `gemini-3-pro-image-preview`, `GEMINI_VISION_MODEL` = `gemini-2.5-flash`.
- `restyle-edits.ts` — shared "stage a reference edit" logic (`loadOwnedRestyle`, `editsFor`, `matchDetected`, `stageEdit`) used by both the product route and (historically) visual-search's stage mode, so the insert+dedupe logic doesn't drift between callers.
- `restyle-render.ts` — `uploadImage` (Blob upload chokepoint — see SharedArrayBuffer gotcha), `recompose` (caches renders per active-edit signature in `restyle_renders`; original + every reference photo fetch in parallel), `closestAspect`.
- `product.ts` — retailer product detail (Unwrangle for Wayfair/Walmart/Home Depot, Rainforest for Amazon).
- `shopping-search.ts` — SerpApi Google Lens visual match + Google Shopping/Amazon/Walmart/HD keyword search (always run in parallel, not gated behind a match-count threshold); `resolveImmersiveToken`/`resolveTokenUrls` (eagerly resolves Wayfair tokens to real URLs so "View on Wayfair" shows without waiting for a pick). Results are filtered to `supported` only before ever reaching the client — an unshoppable card is just noise.
- `image-crop.ts` — `cropToBox` (sharp-based crop from a Gemini box_2d, used server-side for screenshot cleanup).
- `image-client.ts` — `downscaleImage` (browser-side canvas resize before upload — phone photos routinely exceed Vercel's 4.5MB body limit).
- `file-buf.ts` — `fileToBuffer` (stream-read a File/Blob) and `toUnsharedBuffer` (strip SharedArrayBuffer backing before a fetch/Blob-put body — see gotcha).

### Restyle DB tables (Supabase)
- `restyles` — project (original_url, current_url, width/height, detected_objects, custom_items, title, user_id, public_slug)
- `restyle_edits` — change layers (kind `item`/`add`/`style`/`remove`/`refine`, target_label, reference_url/desc, buy_url, product_title/price, active, position)
- `restyle_renders` — cached renders keyed by `signature` (comma-joined active edit ids) for instant toggle-back
- `restyle_searches` (013_restyle_searches.sql, **needs manual application** — see "Pending / known issues") — persisted product-search results per `(restyle_id, label)`: `query`, `results` (jsonb `ShoppingResult[]`), `scored` (bool — false until Gemini scoring + Wayfair token resolution finish in the background). Replaces the old client-side localStorage cache.

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
1. Agent goes to `/restyle/new`, uploads or pastes a room photo → browser uploads it directly to Vercel Blob (`POST /api/restyle/upload-url` for the signed token, then `@vercel/blob/client`'s `upload()`) → `POST /api/restyle` `{photoUrl}` (sharp canonicalizes, stores original, creates project, fires detection in the background) → redirect to `/restyle/[id]`. Splitting the byte transfer from project creation means closing the tab mid-upload just loses the unfinished Blob transfer, never a half-created project.
2. Canvas-first editor loads: room photo with tappable hotspot circles (real detected positions) + a chip row underneath. Right rail shows "Queued changes" (empty at first).
3. Agent taps a hotspot/chip. Sourcing panel opens (side panel on desktop, bottom sheet on mobile):
   - **Paste a link** → `POST /api/restyle/[id]/product` `{url}` stages it immediately as a confirmed real product (buy link known right away, no search needed).
   - **Upload a photo** → same direct-to-Blob upload as step 1, then `POST /api/restyle/[id]/product` `{imageUrl}` stages it as **inspo only** — no shopping search runs yet. This is deliberate: search used to fire the instant a photo was picked, spending API/token cost before the user had even seen the room or decided the item was worth shopping for.
   - **Describe it** → manual "Find" triggers `POST /api/restyle/[id]/visual-search` (text `query`).
4. Agent hits Generate → `POST /api/restyle/[id]/generate` → `recompose` composites all active edits with Gemini, uploads the render (cached per active-edit signature). **This is also when deferred search happens**: for every active edit that's inspo-only (a reference photo, no buy_url), the client calls `visual-search` with `imageUrl` (the already-staged, already-cropped photo) to find real buyable matches — scoped to whatever actually made it into the render, not everything ever staged.
5. Canvas now shows the render. Hotspots reappear (positions approximated from each swapped item's ORIGINAL detected box — see gotchas) with a popover (thumbnail/price/Show-similar/Buy) on tap. Right rail switches to "Shop this look": shoppable items as cards (retailer/price/buy link/running total) plus inline search results for anything still resolving.
6. "Show similar" (from a hotspot popover, a chip, or Shop-this-look's Replace button) opens `SimilarItemsPanel` — a clean product-card list to swap in an alternative, reusing the search that already ran rather than re-prompting for a link/photo.
7. Compare slider + download on the canvas. Shareable client link via `public_slug`.

---

## Important gotchas
- `src/proxy.ts` (not `middleware.ts`) — Next.js 16 picks it up as middleware. Unauthenticated requests to protected routes get a 404 HTML page (Clerk's `protect-rewrite`), not a 401.
- Supabase free tier = 50 MB hard upload cap. **Do not use Supabase Storage for binary files.** DB only.
- Modal `@modal.web_endpoint` is deprecated — use `@modal.fastapi_endpoint`.
- The `supabase` pip package is no longer in the Modal worker (removed when switching to Vercel Blob).
- Vercel body size limit is 4.5 MB — all large file operations must go direct to Vercel Blob from the browser.
- **"SharedArrayBuffer is not allowed" on Vercel is an undici/fetch error, NOT a sharp error.** It's thrown by undici's fetch body validation (`allowShared:false`) when a Buffer whose `.buffer` is a genuine SharedArrayBuffer is used as a fetch body. Vercel Blob's `put()` sends the body via fetch, and on Vercel's Linux runtime `sharp`'s `toBuffer()` output is backed by a SharedArrayBuffer (libvips memory pool). It never reproduces on macOS. **Fix:** wrap any sharp-derived (or pool-backed) buffer in `toUnsharedBuffer()` (`src/lib/file-buf.ts`) before passing it to `put()`/fetch. Already applied at the single chokepoint `uploadImage()` in `src/lib/restyle-render.ts`. Do NOT chase this in sharp's *inputs* — that's the wrong layer. (`src/app/api/reels/route.ts` has the same latent pattern if it ever uploads a sharp-derived buffer.)
- Design system is **Warm Modern** (app-wide, not just restyle — replaced the earlier "Swiss Minimalism" system in a July 2026 reskin): `--primary: #1c1c1a` near-black (pills/CTAs), `--accent: #354733` forest green (buy/product actions — use the `accent`/`accentSoft` `Button` variants), warm off-white `--background: #faf9f6`, white `--card`. All buttons/chips/inputs/tabs are pill-shaped (`rounded-full`); cards/popovers/sheets use `rounded-2xl`/`rounded-3xl`. Depth comes from `shadow-[var(--shadow-soft)]` (resting) and `shadow-[var(--shadow-pop)]` (floating/hover) — `rounded-none` and `shadow-none` must not appear anywhere (grep-gated). 8px grid, tight `letter-spacing: -0.02em` headings. Tokens in `src/app/globals.css`. Use `lucide-react` icons, never emoji. Full primitive set lives in `src/app/(app)/restyle/[id]/ui.tsx` (see the pages/components list above) and uses `cva`. `cn()` helper in `src/lib/utils.ts`. `shared.ts` (old rounded-corner style constants) was deleted along with the wizard — nothing in the restyle tree should import styling from anywhere but `ui.tsx` now. A hotspot pulse animation (`@keyframes hotspot-pulse` in globals.css) is disabled for everyone by the existing `prefers-reduced-motion` block — don't add a second guard around it.
- Detection is non-deterministic — always read the item list from the persisted `restyles.detected_objects`, never re-detect on each load (the chips would change every time).
- **"Placed" UI (the hotspot popover, buy links, price) must never show on the ORIGINAL photo** — only on a render, where the item is genuinely visible. A past bug (`StagedStrip`, since deleted) showed full product cards for anything queued to generate regardless of whether the currently-displayed image reflected it, which reads as "the app is lying about what's in my room." The fix pattern: gate on `ws.viewingOriginal` (or the render's `signature`-derived `shownProductIds`, which `productEdits`/`inspoEdits`/`canvasHotspots` all filter through) — never on "is something staged" alone. `QueuedChanges` (right rail) and `QueuedHotspotPopover` (on-canvas) are the deliberately-different "pending, not real yet" views for while `viewingOriginal` is true (or a change is staged but not yet in the displayed render).
- Deferred search cost note: this was a direct product decision (see the "Room Restyle flow" step 4) — don't reintroduce an automatic search-on-photo-upload without checking with the user first, since removing it was explicitly to avoid spending API/token cost before the user has committed to generating.
- `next/server`'s `after()` is used twice in restyle: object detection at project-create time, and Gemini scoring / Wayfair token resolution in `visual-search`. On Vercel, `after()` work runs within the route's own `maxDuration` (via `waitUntil`) — if you extend either of those background jobs, check the route's `maxDuration` covers it.
