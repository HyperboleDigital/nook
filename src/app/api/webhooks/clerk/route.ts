import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const body = await req.text();
  const svixId = req.headers.get("svix-id")!;
  const svixTimestamp = req.headers.get("svix-timestamp")!;
  const svixSignature = req.headers.get("svix-signature")!;

  let event: { type: string; data: Record<string, unknown> };
  try {
    const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const user = event.data;
    const primaryEmail = (user.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address;
    await supabaseAdmin.from("users").insert({
      clerk_id: user.id,
      email: primaryEmail,
      plan: "free",
      tours_used: 0,
    });
  }

  return NextResponse.json({ received: true });
}
