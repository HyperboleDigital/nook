"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TourViewer from "@/components/tour-viewer";
import MeshViewer from "@/components/mesh-viewer";
import type { Tour } from "@/types";

const POLL_INTERVAL_MS = 10_000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export default function TourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tour, setTour] = useState<Tour | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTour = async () => {
    const res = await fetch(`/api/tours/${id}`);
    if (res.status === 401) { router.push("/sign-in"); return; }
    if (res.status === 404) { setNotFound(true); return; }
    if (!res.ok) return;
    const data: Tour = await res.json();
    setTour(data);
    if (data.status === "complete" || data.status === "failed") {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  useEffect(() => {
    fetchTour();
    intervalRef.current = setInterval(fetchTour, POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const copyShareUrl = () => {
    if (!tour) return;
    navigator.clipboard.writeText(`${APP_URL}/tour/${tour.public_slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (notFound) {
    return (
      <div className="max-w-4xl text-center py-20">
        <div className="text-4xl mb-4">404</div>
        <p className="text-[var(--muted-foreground)] mb-4">Tour not found.</p>
        <Link href="/dashboard" className="text-sm underline">← Dashboard</Link>
      </div>
    );
  }

  if (!tour) {
    return (
      <div className="max-w-4xl">
        <div className="h-8 w-48 bg-[var(--muted)] rounded animate-pulse mb-2" />
        <div className="h-4 w-32 bg-[var(--muted)] rounded animate-pulse" />
      </div>
    );
  }

  const shareUrl = `${APP_URL}/tour/${tour.public_slug}`;
  const isMesh = tour.content_type === "mesh";
  const hasContent = isMesh ? !!tour.model_url : !!tour.ply_url;

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <Link href="/dashboard" className="text-sm text-[var(--muted-foreground)] hover:underline mb-2 block">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold">{tour.title}</h1>
        </div>

        {tour.status === "complete" && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              readOnly
              value={shareUrl}
              className="text-sm border border-[var(--border)] rounded-lg px-3 py-2 w-60 bg-[var(--muted)] font-mono"
            />
            <button
              onClick={copyShareUrl}
              className="text-sm bg-slate-900 text-white px-4 py-2 rounded-lg hover:opacity-90 whitespace-nowrap"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            {!isMesh && (
              <a
                href={`https://superspl.at/editor?load=${encodeURIComponent(tour.ply_url ?? "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm border border-[var(--border)] px-4 py-2 rounded-lg hover:bg-[var(--muted)] whitespace-nowrap"
              >
                Edit in SuperSplat ↗
              </a>
            )}
          </div>
        )}
      </div>

      {tour.status === "complete" && hasContent ? (
        <div className="rounded-2xl overflow-hidden border border-[var(--border)]" style={{ height: "calc(100vh - 220px)" }}>
          {isMesh ? (
            <MeshViewer modelUrl={tour.model_url!} />
          ) : (
            <TourViewer plyUrl={tour.ply_url!} />
          )}
        </div>
      ) : tour.status === "failed" ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-16 text-center">
          <div className="text-4xl mb-4">❌</div>
          <div className="font-semibold mb-2">Generation failed</div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Something went wrong during processing. Please try creating a new tour.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-16 text-center">
          <div className="text-4xl mb-4">
            <span className="inline-block animate-spin">⚙️</span>
          </div>
          <div className="font-semibold mb-2">
            {tour.status === "pending" ? "Queued for processing…" : "Generating your 3D tour…"}
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mb-1">
            This typically takes 30–45 minutes. You can close this tab and come back.
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Checking for updates every 10 seconds…
          </p>
        </div>
      )}
    </div>
  );
}
