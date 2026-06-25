import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: tour } = await supabaseAdmin
    .from("tours")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!tour) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(tour);
}
