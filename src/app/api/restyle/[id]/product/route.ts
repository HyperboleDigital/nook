import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { uploadImage } from "@/lib/restyle-render";
import { fetchProduct, ProductFetchError } from "@/lib/product";
import { describeProductImages } from "@/lib/gemini";
import type { DetectedObject } from "@/types";

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

// POST — add a product by URL. Body: { url }.
// Fetches the listing, stores its image as a reference edit, and auto-decides
// replace-vs-add. Does NOT render — the client calls POST /generate when ready.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { url } = await req.json().catch(() => ({}));
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "A product link is required." }, { status: 400 });
  }

  let info;
  try {
    info = await fetchProduct(url);
  } catch (err) {
    if (err instanceof ProductFetchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Couldn't fetch that product." }, { status: 502 });
  }

  // Copy the product image into our own Blob storage (stable, CDN-served).
  let referenceUrl: string;
  try {
    const res = await fetch(info.imageUrl);
    if (!res.ok) throw new Error("image fetch failed");
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    referenceUrl = await uploadImage(userId, buf, mime);
  } catch {
    return NextResponse.json({ error: "Couldn't load the product image." }, { status: 502 });
  }

  // Replace a matching detected item, otherwise add it as something new.
  const matched = matchDetected(restyle.detected_objects, info.itemType);
  const kind = matched ? "item" : "add";
  const targetLabel = matched ?? info.itemType;

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

  const existing = await editsFor(id);
  const position = existing.length;

  const { data: inserted, error } = await supabaseAdmin.from("restyle_edits").insert({
    restyle_id: id, kind, target_label: targetLabel, instruction: null,
    reference_url: referenceUrl, reference_desc: referenceDesc,
    buy_url: info.buyUrl, product_title: info.title, product_price: info.price ?? null,
    active: true, position,
  }).select().single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });

  // Single active item per detected label.
  if (kind === "item") {
    await supabaseAdmin.from("restyle_edits").update({ active: false })
      .eq("restyle_id", id).eq("kind", "item").eq("target_label", targetLabel).neq("id", inserted.id);
  }

  return NextResponse.json({
    edits: await editsFor(id),
    added: { id: inserted.id, kind, target_label: targetLabel, retailer: info.retailer },
  });
}
