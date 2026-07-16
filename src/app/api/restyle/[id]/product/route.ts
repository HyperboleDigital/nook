import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { uploadImage, adoptCachedRenderIfKnown } from "@/lib/restyle-render";
import { fetchProduct, ProductFetchError, type ProductInfo } from "@/lib/product";
import { describeProductImages, describeScreenshotForSearch, locateProductPhoto } from "@/lib/gemini";
import { resolveImmersiveToken } from "@/lib/shopping-search";
import { editsFor, loadOwnedRestyle, stageEdit, type StagedProduct } from "@/lib/restyle-edits";
import { supabaseAdmin } from "@/lib/supabase";
import { cropToBox } from "@/lib/image-crop";
import type { RestyleEdit } from "@/types";

// Amazon scrapes via Unwrangle can take 60–90s, plus Gemini gallery sizing afterward.
export const maxDuration = 120;

/** Fetch a remote image and return Gemini-ready { base64, mimeType }. */
async function urlToImagePart(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("image fetch failed");
  return {
    base64: Buffer.from(await res.arrayBuffer()).toString("base64"),
    mimeType: res.headers.get("content-type") || "image/jpeg",
  };
}

/** Build a reference edit from a product listing (URL or visual-search token). */
async function fromListing(userId: string, info: ProductInfo): Promise<StagedProduct> {
  // Copy the product image into our own Blob storage (stable, CDN-served). Reuse the same
  // fetched bytes for both the Blob copy and the first gallery vision part below — no
  // second fetch of the primary image.
  let mainBuf: Buffer;
  let mainMime: string;
  let referenceUrl: string;
  try {
    const res = await fetch(info.imageUrl);
    if (!res.ok) throw new Error("image fetch failed");
    mainBuf = Buffer.from(await res.arrayBuffer());
    mainMime = res.headers.get("content-type") || "image/jpeg";
    referenceUrl = await uploadImage(userId, mainBuf, mainMime);
  } catch {
    throw new ProductFetchError("Couldn't load the product image.", 502);
  }

  // Recover real dimensions + proportions from the gallery (which usually includes
  // a spec diagram) — retail APIs rarely return size as text, but accurate scale is
  // the whole point of "shop the look". Best-effort; falls back to the listing text.
  // Fetched in parallel — this used to be a sequential for-loop over up to 5 images.
  let visionDesc = "";
  try {
    const otherUrls = info.images.filter((u, i, a) => u && u !== info.imageUrl && a.indexOf(u) === i).slice(0, 4);
    const otherParts = await Promise.all(
      otherUrls.map((u) => urlToImagePart(u).catch(() => null))
    );
    const parts = [{ base64: mainBuf.toString("base64"), mimeType: mainMime }, ...otherParts.filter((p) => p !== null)];
    visionDesc = await describeProductImages({ images: parts, label: info.itemType });
  } catch { /* best-effort — render still works without it */ }

  const referenceDesc = [
    info.title,
    visionDesc || info.description,
    info.dimensions && `Dimensions: ${info.dimensions}`,
  ].filter(Boolean).join(". ").slice(0, 900);

  return {
    referenceUrl, referenceDesc, itemType: info.itemType,
    buyUrl: info.buyUrl, productTitle: info.title, productPrice: info.price ?? null, retailer: info.retailer,
  };
}

/**
 * Build a reference edit from a photo the user uploaded — just inspiration, nothing to buy
 * yet. Uploading a photo no longer triggers a shopping search immediately: that used to run
 * (and cost tokens/API calls) the moment someone picked a photo, even if they were still
 * deciding. Now it's deferred until the room is actually generated — POST /generate then
 * looks up buyable options for whatever inspo photos made it into the render, surfaced in
 * "Shop this look" instead of mid-composition. Pasting a product link is unaffected — that's
 * already a confirmed real product, nothing to search for.
 *
 * The client uploads the raw photo straight to Vercel Blob first (see /api/restyle/upload-url)
 * and only sends the resulting URL here — `rawBuf` is fetched from that URL, not read from a
 * multipart body, so a closed tab can only interrupt the (separate, resumable) Blob transfer,
 * never strand a half-staged edit.
 */
async function fromUpload(userId: string, rawUrl: string): Promise<StagedProduct> {
  const res = await fetch(rawUrl);
  if (!res.ok) throw new ProductFetchError("Couldn't load that photo.", 502);
  const rawBuf: Buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/jpeg";

  let identified: { itemType: string; description: string };
  try {
    identified = await describeScreenshotForSearch({ imageBase64: rawBuf.toString("base64"), mimeType });
  } catch {
    throw new ProductFetchError("Couldn't identify an item in that photo. Try a clearer image.", 422);
  }

  let buf = rawBuf;
  try {
    const box = await locateProductPhoto({ imageBase64: rawBuf.toString("base64"), mimeType });
    if (box) buf = await cropToBox(rawBuf, box);
  } catch { /* best-effort — fall back to the full screenshot */ }
  const base64 = buf.toString("base64");

  let referenceUrl: string;
  try {
    referenceUrl = await uploadImage(userId, buf, mimeType);
  } catch {
    throw new ProductFetchError("Couldn't save that photo. Try again.", 502);
  }
  // The client's raw upload is now redundant — referenceUrl above (possibly cropped) is
  // what actually gets used. Best-effort cleanup; never let it fail staging.
  try { await del(rawUrl); } catch { /* orphaned blob, harmless */ }

  let visionDesc = "";
  try {
    visionDesc = await describeProductImages({ images: [{ base64, mimeType }], label: identified.itemType });
  } catch { /* best-effort */ }

  return {
    referenceUrl,
    referenceDesc: (visionDesc || identified.description).slice(0, 900),
    itemType: identified.itemType,
    buyUrl: null, productTitle: null, productPrice: null, retailer: "",
  };
}

// POST — stage a product/photo as a reference edit, then auto-decide replace-vs-add.
// Input shapes, all JSON (Does NOT render — the client calls POST /generate when ready):
//   - { url }      : a pasted retailer product link — a confirmed real product
//   - { token }    : a visual-search candidate (Google Shopping immersive token → URL)
//   - { imageUrl } : an inspo photo, already uploaded by the client to Vercel Blob (see
//                    /api/restyle/upload-url) — staged as a reference with no buy link;
//                    shopping options are looked up later, after generate. Sending only the
//                    URL (not the bytes) means a closed tab can only interrupt that separate,
//                    resumable Blob transfer, never strand a half-staged edit here.
// `targetLabel` force-targets a specific slot (the chip/hotspot the user tapped) instead of
// relying on auto-detection. `replaceEditId` — when this staging supersedes an already-staged
// edit for the same slot, deletes that edit in the same request instead of a separate round-trip
// (and inherits its placement, so a replace keeps the prior spot — see below).
//
// This route NEVER searches. It only stages. Finding cheaper/similar products is always
// user-initiated (the "Shop similar items" / "Replace" flow → visual-search route). An earlier
// version auto-fired a "dupe finder" cheaper-alternatives search here the moment a product link
// was staged; that was removed — staging a pending product the user might discard/replace before
// generating shouldn't spend a search. (The deferred INSPO-photo search after generate is separate
// and still runs — that turns a photo into something buyable, which isn't an "alternatives" search.)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwnedRestyle(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let staged: StagedProduct;
  let forcedTarget: string | undefined;
  let replaceEditId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    const { url: rawUrl, token, imageUrl, targetLabel: ft, replaceEditId: re } = body as {
      url?: string; token?: string; imageUrl?: string; targetLabel?: string; replaceEditId?: string;
    };
    forcedTarget = ft;
    replaceEditId = re;

    if (imageUrl && typeof imageUrl === "string") {
      staged = await fromUpload(userId, imageUrl);
    } else {
      // A visual-search candidate gives us a SerpApi immersive token, not a URL — resolve it.
      // Most candidates arrive with a real productUrl already (visual-search resolves Wayfair
      // tokens eagerly in the background), so this is only a fallback for picks made before
      // that resolution lands.
      let url = rawUrl;
      if (!url && token) {
        const resolved = await resolveImmersiveToken(token);
        if (!resolved) return NextResponse.json({ error: "Couldn't resolve that product link." }, { status: 502 });
        url = resolved;
      }
      if (!url || typeof url !== "string") {
        return NextResponse.json({ error: "A product link is required." }, { status: 400 });
      }
      staged = await fromListing(userId, await fetchProduct(url));
    }
  } catch (err) {
    if (err instanceof ProductFetchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Couldn't add that product." }, { status: 502 });
  }

  let result;
  try {
    result = await stageEdit(id, restyle, staged, forcedTarget);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }

  // A "replace" no longer DELETES the superseded edit — it's kept (already deactivated by
  // stageEdit's single-active-per-label dedupe) so it becomes "tried before" history the user can
  // restore from the compare panel (see useRestyleWorkspace's historyFor/restoreEdit). We only
  // inherit its pin: a replaced add should keep its spot instead of forcing a re-place (only
  // "add" edits carry a placement; a swap of a detected item uses its detected box).
  let edits = result.edits;
  let addedPlacement: RestyleEdit["placement"] = null;
  if (replaceEditId && replaceEditId !== result.added.id && result.added.kind === "add") {
    const { data: replaced } = await supabaseAdmin
      .from("restyle_edits").select("placement").eq("id", replaceEditId).eq("restyle_id", id).maybeSingle();
    if (replaced?.placement) {
      addedPlacement = replaced.placement as RestyleEdit["placement"];
      await supabaseAdmin.from("restyle_edits").update({ placement: addedPlacement }).eq("id", result.added.id);
      edits = await editsFor(id);
    }
  }

  // NOTE: no automatic "cheaper alternatives" search fires here anymore. Searching for
  // alternatives is now ALWAYS user-initiated (the "Shop similar items" / "Replace" flow →
  // visual-search route), never kicked off the moment a product link is staged — staging a
  // pending product the user might discard shouldn't spend a search. (This removed the former
  // "dupe finder" auto-search; the deferred INSPO-photo search after generate is unaffected.)

  // Surface the (possibly inherited) placement so the client knows NOT to re-prompt for a pin on
  // a replace that kept the prior spot (see finalizeAddPlacement's placement guard).
  return NextResponse.json({ edits, added: { ...result.added, placement: addedPlacement }, current_url: await adoptCachedRenderIfKnown(id) });
}
