import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import TourViewer from "@/components/tour-viewer";
import MeshViewer from "@/components/mesh-viewer";
import type { Tour } from "@/types";

export default async function PublicTourPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin
    .from("tours")
    .select("*")
    .eq("public_slug", slug)
    .eq("status", "complete")
    .single();

  const tour = data as Tour | null;
  const isMesh = tour?.content_type === "mesh";
  // Mesh tours render a GLB (model_url); splat tours render a PLY (ply_url).
  if (!tour || (isMesh ? !tour.model_url : !tour.ply_url)) notFound();

  return (
    <div className="flex flex-col h-screen bg-black">
      <div className="flex-1 min-h-0">
        {isMesh ? (
          <MeshViewer modelUrl={tour.model_url!} />
        ) : (
          <TourViewer plyUrl={tour.ply_url!} />
        )}
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
