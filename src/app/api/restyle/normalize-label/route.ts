import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeItemLabel } from "@/lib/gemini";

// POST — turn a free-text "what are you adding?" description into a short, clean item label
// (also doubles as content moderation: a non-item/gibberish/offensive input comes back as an
// error instead of a label). Stateless — not scoped to a restyle id.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Describe what you're adding first." }, { status: 400 });

  const label = await normalizeItemLabel(text);
  if (!label) {
    return NextResponse.json(
      { error: "Couldn't recognize that as a furniture or decor item — try describing it differently." },
      { status: 422 },
    );
  }
  return NextResponse.json({ label });
}
