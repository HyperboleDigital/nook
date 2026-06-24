import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import TourViewer from "@/components/tour-viewer";
import type { Tour } from "@/types";

export default async function PublicTourPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin
    .from("tours")
    .select("*")
    .eq("public_slug", slug)
    .eq("status", "complete")
    .single();

  if (!data || !data.ply_url) notFound();
  const tour = data as Tour;

  return (
    <div className="flex flex-col min-h-screen bg-black">
      <div className="flex-1" style={{ height: "calc(100vh - 64px)" }}>
        <TourViewer plyUrl={tour.ply_url!} />
      </div>
      <footer className="h-16 flex items-center justify-between px-6 bg-black/80 backdrop-blur-sm">
        <span className="text-white font-medium">{tour.title}</span>
        <a
          href="/"
          className="text-xs text-white/50 hover:text-white/80 transition-colors"
        >
          Created with Nook
        </a>
      </footer>
    </div>
  );
}
