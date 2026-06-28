import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as HandleUploadBody;

    const response = await handleUpload({
      body,
      request: req as Parameters<typeof handleUpload>[0]["request"],
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "video/mp4",
          "video/quicktime",
          "video/webm",
          "video/x-msvideo",
          "video/*",
          // GLB dollhouse models (mesh tours). Browsers often send .glb as
          // application/octet-stream, so allow that too.
          "model/gltf-binary",
          "application/octet-stream",
        ],
        maximumSizeInBytes: 2 * 1024 * 1024 * 1024,
        tokenPayload: userId,
        // Required for multipart uploads to work locally: the SDK can't compute
        // a callback URL without VERCEL_URL, so point it at the deployed app.
        // We don't rely on onUploadCompleted (Modal is triggered separately),
        // so this callback firing to prod is harmless.
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? { callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/tours/upload-url` }
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
