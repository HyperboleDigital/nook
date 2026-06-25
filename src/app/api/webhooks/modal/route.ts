import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("x-modal-secret") ?? "";
  const secret = process.env.MODAL_WEBHOOK_SECRET ?? "";

  // Validate HMAC signature from Modal worker
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (secret && sig !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { tour_id, ply_url, status, error } = JSON.parse(body) as {
    tour_id: string;
    ply_url?: string;
    status: "complete" | "failed";
    error?: string;
  };

  if (!tour_id || !status) {
    return NextResponse.json({ error: "tour_id and status are required" }, { status: 400 });
  }

  const update =
    status === "complete"
      ? { status: "complete", ply_url }
      : { status: "failed" };

  const { error: dbError } = await supabaseAdmin
    .from("tours")
    .update(update)
    .eq("id", tour_id);

  if (dbError) {
    console.error("DB update failed:", dbError);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  if (error) console.error(`Tour ${tour_id} failed:`, error);
  console.log(`Tour ${tour_id} → ${status}${ply_url ? ` (${ply_url})` : ""}`);

  return NextResponse.json({ ok: true });
}
