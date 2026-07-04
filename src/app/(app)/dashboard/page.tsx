import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Tour, Reel, Restyle } from "@/types";
import DashboardHome, { type DashboardProject } from "./DashboardHome";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [{ data: tours }, { data: reels }, { data: restyles }] = await Promise.all([
    supabaseAdmin
      .from("tours")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("reels")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("restyles")
      .select("id,title,current_url,updated_at,created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(12),
  ]);

  const tourList = (tours ?? []) as Tour[];
  const reelList = (reels ?? []) as Reel[];
  const restyleList = (restyles ?? []) as Pick<Restyle, "id" | "title" | "current_url" | "updated_at" | "created_at">[];

  const projects: DashboardProject[] = [
    ...restyleList.map((r): DashboardProject => ({
      kind: "restyle", id: r.id, title: r.title ?? "Untitled room", href: `/restyle/${r.id}`,
      thumb: r.current_url, date: r.updated_at,
    })),
    ...tourList.map((t): DashboardProject => ({
      kind: "tour", id: t.id, title: t.title, href: `/tours/${t.id}`,
      thumb: t.thumbnail_url, date: t.created_at, status: t.status,
    })),
    ...reelList.map((r): DashboardProject => ({
      kind: "reel", id: r.id, title: r.title, href: `/reels/${r.id}`,
      thumb: r.thumbnail_url, date: r.created_at, status: r.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return <DashboardHome projects={projects} />;
}
