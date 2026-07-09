import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Restyle } from "@/types";
import DashboardHome, { type DashboardProject } from "./DashboardHome";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Tours isn't shipping in the MVP and old test tour projects were cluttering the dashboard —
  // the `tours` table/routes are untouched (see CLAUDE.md), this just stops surfacing them here.
  const { data: restyles } = await supabaseAdmin
    .from("restyles")
    .select("id,title,current_url,updated_at,created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);

  const restyleList = (restyles ?? []) as Pick<Restyle, "id" | "title" | "current_url" | "updated_at" | "created_at">[];

  const projects: DashboardProject[] = restyleList
    .map((r): DashboardProject => ({
      kind: "restyle", id: r.id, title: r.title ?? "Untitled room", href: `/restyle/${r.id}`,
      thumb: r.current_url, date: r.updated_at,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return <DashboardHome projects={projects} />;
}
