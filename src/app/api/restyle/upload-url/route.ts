import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// Signed-token endpoint for direct browser -> Vercel Blob uploads of restyle room photos and
// inspo/reference photos. Decouples the byte transfer from our own serverless functions (see
// src/app/api/restyle/route.ts and src/app/api/restyle/[id]/product/route.ts) — closing the
// tab mid-upload just loses an unfinished Blob transfer, not a half-created DB row, mirroring
// the same pattern already used for Tours (src/app/api/tours/upload-url/route.ts).
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as HandleUploadBody;

    const response = await handleUpload({
      body,
      request: req as Parameters<typeof handleUpload>[0]["request"],
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/*"],
        maximumSizeInBytes: 20 * 1024 * 1024,
        tokenPayload: userId,
        // Required for multipart uploads to work locally: the SDK can't compute a callback
        // URL without VERCEL_URL, so point it at the deployed app instead. onUploadCompleted
        // is a no-op — the follow-up JSON call (create restyle / stage edit) does the real
        // work once the client confirms the upload finished.
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? { callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/restyle/upload-url` }
          : {}),
      }),
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 }
    );
  }
}
