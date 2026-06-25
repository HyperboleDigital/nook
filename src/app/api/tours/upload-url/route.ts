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
        ],
        maximumSizeInBytes: 2 * 1024 * 1024 * 1024,
        tokenPayload: userId,
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
