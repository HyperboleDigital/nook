import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ExternalLink, ShoppingBag } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Retailer display name from a product URL (kept inline so this stays a clean server component).
function storeName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    const known: Record<string, string> = { wayfair: "Wayfair", amazon: "Amazon", walmart: "Walmart", homedepot: "Home Depot", ikea: "IKEA" };
    return known[base] ?? base.charAt(0).toUpperCase() + base.slice(1);
  } catch { return "Store"; }
}
const priceNum = (p: string | null) => Number(String(p ?? "").replace(/[^0-9.]/g, "")) || 0;

type ShopRow = {
  id: string; product_title: string | null; product_price: string | null; buy_url: string;
  reference_url: string | null; target_label: string | null; roomId: string; roomTitle: string;
};

export default async function ShopPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Every product currently active across the user's rooms (a real buy_url = something to buy).
  const { data: rooms } = await supabaseAdmin
    .from("restyles").select("id, title").eq("user_id", userId);
  const roomById = new Map((rooms ?? []).map((r) => [r.id as string, (r.title as string) || "Untitled room"]));

  let items: ShopRow[] = [];
  if (roomById.size > 0) {
    const { data: edits } = await supabaseAdmin
      .from("restyle_edits")
      .select("id, product_title, product_price, buy_url, reference_url, target_label, restyle_id")
      .in("restyle_id", [...roomById.keys()])
      .eq("active", true)
      .not("buy_url", "is", null)
      .order("created_at", { ascending: false });
    items = (edits ?? []).map((e) => ({
      id: e.id, product_title: e.product_title, product_price: e.product_price, buy_url: e.buy_url as string,
      reference_url: e.reference_url, target_label: e.target_label,
      roomId: e.restyle_id as string, roomTitle: roomById.get(e.restyle_id as string) ?? "Untitled room",
    }));
  }

  const total = items.reduce((s, i) => s + priceNum(i.product_price), 0);
  const priced = items.filter((i) => i.product_price).length;

  return (
    <div className="max-w-2xl mx-auto lg:mx-0">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Shop the look</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {items.length === 0 ? "Every product you add to a room shows up here."
            : <>{items.length} item{items.length === 1 ? "" : "s"} across your rooms{priced > 0 && <> · <span className="font-semibold text-[var(--foreground)]">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}</>}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[var(--border)] p-16 text-center">
          <ShoppingBag className="h-8 w-8 mx-auto mb-3 text-[var(--muted-foreground)]" strokeWidth={1.5} />
          <p className="text-sm text-[var(--muted-foreground)] mb-4">Nothing to shop yet.</p>
          <Link href="/dashboard" className="inline-block rounded-full bg-[var(--foreground)] text-white text-sm font-semibold px-5 py-2">
            Go to your rooms →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} className="flex gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-soft)]">
              {i.reference_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={i.reference_url} alt="" className="h-16 w-16 object-cover rounded-xl border border-[var(--border)] bg-[var(--muted)] shrink-0" />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-[var(--muted)] border border-[var(--border)] shrink-0" />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium capitalize line-clamp-2 leading-snug">{i.product_title ?? i.target_label ?? "Product"}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {i.product_price && <span className="font-semibold text-[var(--foreground)]">{i.product_price}</span>}
                  {i.product_price && " · "}{storeName(i.buy_url)}
                </p>
                <Link href={`/restyle/${i.roomId}`} className="inline-block text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline underline-offset-2">
                  {i.roomTitle}
                </Link>
              </div>
              <a href={i.buy_url} target="_blank" rel="noopener noreferrer"
                className="self-start inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] text-xs font-semibold px-3.5 py-2 hover:opacity-90 transition-opacity shrink-0">
                Buy <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
