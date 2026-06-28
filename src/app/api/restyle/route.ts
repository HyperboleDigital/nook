import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { restyleRoom, type RestyleTheme } from "@/lib/gemini";

// POST /api/restyle — AI virtual staging.
// Accepts multipart form: photo (image), theme, optional instruction, optional
// baseImage (the latest result, for iterative edits). Room photos are small, so
// multipart-to-route is fine. Returns { url } of the restyled image on Vercel Blob.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const theme = (form.get("theme") as string | null) ?? "modern";
    const instruction = (form.get("instruction") as string | null) ?? undefined;

    // For an iterative edit, transform the latest result; otherwise the new photo.
    const baseImage = form.get("baseImage") as File | null;
    const photo = form.get("photo") as File | null;
    const source = baseImage ?? photo;

    if (!source) {
      return NextResponse.json({ error: "A room photo is required" }, { status: 400 });
    }

    const buf = Buffer.from(await source.arrayBuffer());
    const imageBase64 = buf.toString("base64");
    const mimeType = source.type || "image/jpeg";

    const result = await restyleRoom({
      imageBase64,
      mimeType,
      theme: theme as RestyleTheme,
      instruction,
    });

    const ext = result.mimeType.includes("jpeg") ? "jpg" : "png";
    const blob = await put(
      `restyle/${userId}/${Date.now()}.${ext}`,
      Buffer.from(result.base64, "base64"),
      { access: "public", contentType: result.mimeType }
    );

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Restyle failed" },
      { status: 500 }
    );
  }
}
