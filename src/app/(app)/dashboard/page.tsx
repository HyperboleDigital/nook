import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Tour, Reel } from "@/types";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [{ data: tours }, { data: reels }] = await Promise.all([
    supabaseAdmin
      .from("tours")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("reels")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const tourList = (tours ?? []) as Tour[];
  const reelList = (reels ?? []) as Reel[];

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-[var(--muted-foreground)] text-sm">
          Your 3D tours and Reels in one place.
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-10">
        <Link
          href="/tours/new"
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 hover:border-slate-400 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="font-semibold mb-1">New 3D Tour</div>
          <div className="text-sm text-[var(--muted-foreground)]">Upload a walkthrough video</div>
        </Link>
        <Link
          href="/reels/new"
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 hover:border-slate-400 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="font-semibold mb-1">New Reel</div>
          <div className="text-sm text-[var(--muted-foreground)]">Upload photos or video clips</div>
        </Link>
      </div>

      {/* Tours */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">3D Tours</h2>
          <Link href="/tours/new" className="text-sm text-[var(--muted-foreground)] hover:underline">
            + New tour
          </Link>
        </div>
        {tourList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted-foreground)]">
            No tours yet.{" "}
            <Link href="/tours/new" className="underline">
              Create your first one →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {tourList.map((tour) => (
              <Link
                key={tour.id}
                href={`/tours/${tour.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 hover:border-slate-400 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{tour.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {new Date(tour.created_at).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={tour.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Reels */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Reels</h2>
          <Link href="/reels/new" className="text-sm text-[var(--muted-foreground)] hover:underline">
            + New reel
          </Link>
        </div>
        {reelList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] p-10 text-center text-sm text-[var(--muted-foreground)]">
            No reels yet.{" "}
            <Link href="/reels/new" className="underline">
              Create your first one →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {reelList.map((reel) => (
              <Link
                key={reel.id}
                href={`/reels/${reel.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-4 hover:border-slate-400 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{reel.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {new Date(reel.created_at).toLocaleDateString()}
                  </div>
                </div>
                <StatusBadge status={reel.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    processing: "bg-blue-50 text-blue-700 border-blue-200",
    complete: "bg-green-50 text-green-700 border-green-200",
    failed: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${styles[status] ?? "bg-gray-50 text-gray-700 border-gray-200"}`}>
      {status}
    </span>
  );
}
