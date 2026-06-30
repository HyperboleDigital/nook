import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { describeScreenshotForSearch } from "@/lib/gemini";
import { searchShopping, ShoppingSearchError } from "@/lib/shopping-search";

// Gemini identify + four parallel SerpApi searches.
export const maxDuration = 60;

async function loadOwned(restyleId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from("restyles").select("id").eq("id", restyleId).eq("user_id", userId).single();
  return data;
}

// POST — screenshot → Gemini description → SerpApi shopping search → candidate list.
// Does NOT render anything; client calls POST /api/restyle/[id]/product when user picks.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const restyle = await loadOwned(id, userId);
  if (!restyle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "An image is required." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That file isn't an image." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  let parsed;
  try {
    parsed = await describeScreenshotForSearch({ imageBase64: buf.toString("base64"), mimeType });
  } catch {
    return NextResponse.json(
      { error: "Couldn't identify an item in that image. Try a clearer screenshot." },
      { status: 422 },
    );
  }

  let results;
  try {
    results = await searchShopping(`${parsed.description} ${parsed.itemType}`.trim());
  } catch (err) {
    if (err instanceof ShoppingSearchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Product search failed." }, { status: 502 });
  }

  return NextResponse.json({ itemType: parsed.itemType, description: parsed.description, results });
}
