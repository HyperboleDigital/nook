import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, storagePath } = await req.json();

  if (!title || !storagePath) {
    return NextResponse.json({ error: "title and storagePath are required" }, { status: 400 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from("nook-uploads")
    .getPublicUrl(storagePath);
  const videoUrl = publicUrlData.publicUrl;

  const { data: tour, error } = await supabaseAdmin
    .from("tours")
    .insert({
      user_id: userId,
      title,
      status: "pending",
      public_slug: nanoid(10),
    })
    .select()
    .single();

  if (error || !tour) {
    return NextResponse.json({ error: error?.message ?? "DB error" }, { status: 500 });
  }

  // Fire-and-forget: trigger Modal GPU worker
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/modal`;
  const modalUrl = process.env.MODAL_WEBHOOK_URL;

  if (modalUrl) {
    fetch(modalUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_url: videoUrl, tour_id: tour.id, callback_url: callbackUrl }),
    }).catch((err) => console.error("Failed to trigger Modal worker:", err));
  } else {
    console.warn("MODAL_WEBHOOK_URL not set — 3D processing will not start");
  }

  return NextResponse.json({ id: tour.id });
}
