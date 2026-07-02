import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { uploadImage } from "@/lib/restyle-render";
import { fetchProduct, ProductFetchError, type ProductInfo } from "@/lib/product";
import { describeProductImages, describeScreenshotForSearch, locateProductPhoto } from "@/lib/gemini";
import { resolveImmersiveToken } from "@/lib/shopping-search";
import { editsFor, loadOwnedRestyle, stageEdit, type StagedProduct } from "@/lib/restyle-edits";
import { supabaseAdmin } from "@/lib/supabase";
import { fileToBuffer } from "@/lib/file-buf";
import { cropToBox } from "@/lib/image-crop";

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
 */
async function fromUpload(userId: string, file: File): Promise<StagedProduct> {
  const rawBuf = await fileToBuffer(file);
  const mimeType = file.type || "image/jpeg";

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
// Input shapes (Does NOT render — the client calls POST /generate when ready):
//   - JSON { url }         : a pasted retailer product link — a confirmed real product
//   - JSON { token }       : a visual-search candidate (Google Shopping immersive token → URL)
//   - multipart image      : an inspo photo — staged as a reference with no buy link;
//                            shopping options are looked up later, after generate.
// `targetLabel` force-targets a specific slot (the chip/hotspot the user tapped) instead of
// relying on auto-detection. `replaceEditId` — when this staging supersedes an already-staged
// edit for the same slot, deletes that edit in the same request instead of a separate round-trip.
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
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image") as File | null;
      if (!file) return NextResponse.json({ error: "An image is required." }, { status: 400 });
      if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That file isn't an image." }, { status: 400 });
      forcedTarget = (form.get("targetLabel") as string | null) || undefined;
      replaceEditId = (form.get("replaceEditId") as string | null) || undefined;
      staged = await fromUpload(userId, file);
    } else {
      const body = await req.json().catch(() => ({}));
      const { url: rawUrl, token, targetLabel: ft, replaceEditId: re } = body as {
        url?: string; token?: string; targetLabel?: string; replaceEditId?: string;
      };
      forcedTarget = ft;
      replaceEditId = re;

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

  // Delete the edit being replaced (e.g. a staged photo now superseded by a real pick) in
  // the same request — used to be a separate client-side DELETE round-trip after this POST.
  let edits = result.edits;
  if (replaceEditId && replaceEditId !== result.added.id) {
    await supabaseAdmin.from("restyle_edits").delete().eq("id", replaceEditId).eq("restyle_id", id);
    edits = await editsFor(id);
  }

  return NextResponse.json({ edits, added: result.added });
}
