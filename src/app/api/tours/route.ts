import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, videoUrl, modelUrl, contentType } = await req.json();
  const isMesh = contentType === "mesh";

  if (!title || (isMesh ? !modelUrl : !videoUrl)) {
    return NextResponse.json(
      { error: isMesh ? "title and modelUrl are required" : "title and videoUrl are required" },
      { status: 400 }
    );
  }

  // Ensure the user row exists (the Clerk webhook can't reach localhost, and we
  // don't want tour creation to fail on the tours_user_id_fkey constraint).
  // ignoreDuplicates = INSERT ... ON CONFLICT DO NOTHING, so existing plan/usage is preserved.
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
  const { error: userError } = await supabaseAdmin
    .from("users")
    .upsert(
      { clerk_id: userId, email, plan: "free", tours_used: 0, reels_used: 0 },
      { onConflict: "clerk_id", ignoreDuplicates: true }
    );
  if (userError) {
    return NextResponse.json({ error: `Failed to sync user: ${userError.message}` }, { status: 500 });
  }

  // Mesh tours hold a pre-generated GLB, so they're complete on creation with no
  // GPU job. Splat tours start "pending" and trigger the Modal worker below.
  const { data: tour, error } = await supabaseAdmin
    .from("tours")
    .insert(
      isMesh
        ? {
            user_id: userId,
            title,
            content_type: "mesh",
            model_url: modelUrl,
            status: "complete",
            public_slug: nanoid(10),
          }
        : {
            user_id: userId,
            title,
            content_type: "splat",
            video_url: videoUrl,
            status: "pending",
            public_slug: nanoid(10),
          }
    )
    .select()
    .single();

  if (error || !tour) {
    return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });
  }

  // Mesh tours need no processing — return immediately.
  if (isMesh) {
    return NextResponse.json({ id: tour.id });
  }

  // Trigger Modal GPU worker — returns immediately now that it uses .spawn()
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/modal`;
  const modalUrl = process.env.MODAL_WEBHOOK_URL;

  if (modalUrl) {
    try {
      await fetch(modalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: videoUrl, tour_id: tour.id, callback_url: callbackUrl }),
      });
    } catch (err) {
      console.error("Failed to trigger Modal worker:", err);
    }
  } else {
    console.warn("MODAL_WEBHOOK_URL not set — 3D processing will not start");
  }

  return NextResponse.json({ id: tour.id });
}
