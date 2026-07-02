import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/restyle-render";
import { fetchProduct, ProductFetchError, type ProductInfo } from "@/lib/product";
import { describeProductImages, describeScreenshotForSearch, locateProductPhoto } from "@/lib/gemini";
import { resolveImmersiveToken } from "@/lib/shopping-search";
import { fileToBuffer } from "@/lib/file-buf";
import { cropToBox } from "@/lib/image-crop";
import type { DetectedObject } from "@/types";

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

async function loadOwned(restyleId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("restyles").select("*").eq("id", restyleId).eq("user_id", userId).single();
  return data;
}

async function editsFor(restyleId: string) {
  const { data } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", restyleId).order("position", { ascending: true });
  return data ?? [];
}

/** Find a detected object whose label overlaps the product's item type (→ replace it). */
function matchDetected(objects: DetectedObject[] | null, itemType: string): string | null {
  if (!objects?.length) return null;
  const t = itemType.toLowerCase();
  const hit = objects.find((o) => {
    const l = o.label.toLowerCase();
    return l === t || l.includes(t) || t.includes(l);
  });
  return hit?.label ?? null;
}

/** Build a reference edit from a product listing (URL or visual-search token). */
async function fromListing(userId: string, info: ProductInfo): Promise<StagedProduct> {
  // Copy the product image into our own Blob storage (stable, CDN-served).
  let referenceUrl: string;
  try {
    const res = await fetch(info.imageUrl);
    if (!res.ok) throw new Error("image fetch failed");
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    referenceUrl = await uploadImage(userId, buf, mime);
  } catch {
    throw new ProductFetchError("Couldn't load the product image.", 502);
  }

  // Recover real dimensions + proportions from the gallery (which usually includes
  // a spec diagram) — retail APIs rarely return size as text, but accurate scale is
  // the whole point of "shop the look". Best-effort; falls back to the listing text.
  let visionDesc = "";
  try {
    const galleryUrls = [info.imageUrl, ...info.images]
      .filter((u, i, a) => u && a.indexOf(u) === i)
      .slice(0, 5);
    const parts: { base64: string; mimeType: string }[] = [];
    for (const u of galleryUrls) {
      try { parts.push(await urlToImagePart(u)); } catch { /* skip unreadable image */ }
    }
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

/** Build a reference edit from a screenshot the user uploaded — just render it, nothing to buy. */
async function fromUpload(userId: string, file: File): Promise<StagedProduct> {
  const rawBuf = await fileToBuffer(file);
  const mimeType = file.type || "image/jpeg";

  // Identify off the ORIGINAL screenshot — listing screenshots often carry the literal
  // product title/brand as legible text, a much stronger signal than a generic description.
  let identified: { itemType: string; description: string };
  try {
    identified = await describeScreenshotForSearch({ imageBase64: rawBuf.toString("base64"), mimeType });
  } catch {
    throw new ProductFetchError("Couldn't identify an item in that photo. Try a clearer image.", 422);
  }

  // Full-page/app screenshots carry UI chrome (nav bars, price, buttons) that pollutes the
  // render reference — crop to just the product photo before staging/rendering with it.
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

  // Recover proportions/dimensions from the single photo for accurate scale.
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

interface StagedProduct {
  referenceUrl: string;
  referenceDesc: string;
  itemType: string;
  buyUrl: string | null;
  productTitle: string | null;
  productPrice: string | null;
  retailer: string;
}

// POST — stage a product as a reference edit, then auto-decide replace-vs-add.
// Three input shapes (Does NOT render — the client calls POST /generate when ready):
//   - JSON { url }    : a pasted retailer product link
//   - JSON { token }  : a visual-search candidate (Google Shopping immersive token → URL)
//   - multipart image : the user's own screenshot — rendered directly, nothing to buy
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let staged: StagedProduct;
  let forcedTarget: string | undefined;
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image") as File | null;
      if (!file) return NextResponse.json({ error: "An image is required." }, { status: 400 });
      if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That file isn't an image." }, { status: 400 });
      staged = await fromUpload(userId, file);
    } else {
      const body = await req.json().catch(() => ({}));
      const { url: rawUrl, token, targetLabel: ft } = body as { url?: string; token?: string; targetLabel?: string };
      forcedTarget = ft;

      // A visual-search candidate gives us a SerpApi immersive token, not a URL — resolve it.
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

  // Replace a matching detected item, otherwise add it as something new.
  // forcedTarget (from wizard) takes priority — the user explicitly chose which item.
  let kind: "item" | "add";
  let targetLabel: string;
  if (forcedTarget) {
    const inDetected = (restyle.detected_objects as Array<{ label: string }> | null)
      ?.some(o => o.label.toLowerCase() === forcedTarget.toLowerCase());
    kind = inDetected ? "item" : "add";
    targetLabel = forcedTarget;
  } else {
    const matched = matchDetected(restyle.detected_objects, staged.itemType);
    kind = matched ? "item" : "add";
    targetLabel = matched ?? staged.itemType;
  }

  const existing = await editsFor(id);
  const position = existing.length;

  const { data: inserted, error } = await supabaseAdmin.from("restyle_edits").insert({
    restyle_id: id, kind, target_label: targetLabel, instruction: null,
    reference_url: staged.referenceUrl, reference_desc: staged.referenceDesc,
    buy_url: staged.buyUrl, product_title: staged.productTitle, product_price: staged.productPrice,
    active: true, position,
  }).select().single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });

  // Single active edit per target_label — a label is one conceptual slot in the room
  // regardless of kind. This used to only cover kind "item" (a swap of a detected object),
  // so staging a photo as an "add" (a custom item with no matching detected object, e.g.
  // "canvas print") and later picking a real product for the SAME label left both edits
  // active: the old photo reference never got deactivated. That's what caused the stale
  // "still shows my old screenshot" thumbnail and the picked product going missing from
  // "Shop this look" — the render/signature ended up carrying two conflicting edits for
  // one slot. kind can also flip item⇄add via the PATCH toggle, so match on label across
  // both kinds, not just the kind of the edit we just inserted.
  if (targetLabel) {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("target_label", targetLabel).in("kind", ["item", "add"]).neq("id", inserted.id);
  }

  return NextResponse.json({
    edits: await editsFor(id),
    added: { id: inserted.id, kind, target_label: targetLabel, retailer: staged.retailer },
  });
}
