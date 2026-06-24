import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import TourViewer from "@/components/tour-viewer";
import type { Tour } from "@/types";

export default async function TourPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;
  const { data } = await supabaseAdmin
    .from("tours")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!data) notFound();
  const tour = data as Tour;

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/tour/${tour.public_slug}`;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard" className="text-sm text-[var(--muted-foreground)] hover:underline mb-2 block">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold">{tour.title}</h1>
        </div>
        {tour.status === "complete" && (
          <div className="flex items-center gap-3">
            <input
              readOnly
              value={shareUrl}
              className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 w-64 bg-[var(--muted)] font-mono"
            />
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="text-sm bg-slate-900 text-white px-4 py-2 rounded-lg hover:opacity-90"
            >
              Copy link
            </button>
          </div>
        )}
      </div>

      {tour.status === "complete" && tour.ply_url ? (
        <div className="rounded-2xl overflow-hidden border border-[var(--border)]" style={{ height: 500 }}>
          <TourViewer plyUrl={tour.ply_url} />
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-16 text-center">
          {tour.status === "failed" ? (
            <div>
              <div className="text-4xl mb-4">❌</div>
              <div className="font-semibold mb-2">Generation failed</div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Something went wrong. Please try creating a new tour.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-4 animate-spin">⚙️</div>
              <div className="font-semibold mb-2">
                {tour.status === "pending" ? "Queued…" : "Generating your 3D tour…"}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                This takes 5–10 minutes. You can leave and come back — we&apos;ll keep processing.
              </p>
              <PollingRefresh />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PollingRefresh() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `setTimeout(() => location.reload(), 15000)`,
      }}
    />
  );
}
