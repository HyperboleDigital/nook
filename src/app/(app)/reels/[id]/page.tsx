import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Reel } from "@/types";

export default async function ReelPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const { data } = await supabaseAdmin
    .from("reels")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!data) notFound();
  const reel = data as Reel;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-[var(--muted-foreground)] hover:underline mb-2 block">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-bold">{reel.title}</h1>
      </div>

      {reel.status === "complete" && reel.output_url ? (
        <div className="space-y-4">
          <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-black flex justify-center">
            <video
              src={reel.output_url}
              controls
              autoPlay
              loop
              muted
              playsInline
              className="h-[600px] w-auto"
            />
          </div>
          <a
            href={reel.output_url}
            download
            className="flex items-center justify-center gap-2 w-full bg-slate-900 text-white py-3.5 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
          >
            ⬇ Download MP4
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-16 text-center">
          {reel.status === "failed" ? (
            <div>
              <div className="text-4xl mb-4">❌</div>
              <div className="font-semibold mb-2">Generation failed</div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Something went wrong. Please try creating a new reel.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-4 animate-spin">🎬</div>
              <div className="font-semibold mb-2">
                {reel.status === "pending" ? "Queued…" : "Generating your Reel…"}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                This takes 1–3 minutes. You can leave and come back.
              </p>
              <script
                dangerouslySetInnerHTML={{ __html: `setTimeout(() => location.reload(), 10000)` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
