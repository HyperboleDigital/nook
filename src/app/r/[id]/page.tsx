import { notFound } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, ExternalLink } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import type { Restyle, RestyleEdit } from "@/types";

export const metadata = { title: "Room design — Nook" };

/** Friendly store name from a product URL. */
function storeName(url: string | null | undefined): string {
  if (!url) return "store";
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (/amazon\./.test(h)) return "Amazon";
    if (/wayfair\./.test(h)) return "Wayfair";
    if (/walmart\./.test(h)) return "Walmart";
    if (/homedepot\./.test(h)) return "Home Depot";
    if (/target\./.test(h)) return "Target";
    if (/lowes\./.test(h)) return "Lowe's";
    return h.split(".")[0].replace(/^./, (c) => c.toUpperCase());
  } catch { return "store"; }
}
const parsePrice = (p: string | null) => { const n = Number(String(p ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

// Public, read-only view of a rendered room + its shoppable products. Anyone with the link
// (unguessable id) can view — no auth. No edit controls.
export default async function PublicRestylePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data } = await supabaseAdmin.from("restyles").select("*").eq("id", id).single();
  const restyle = data as Restyle | null;
  if (!restyle || !restyle.current_url) notFound();

  // Products shown = those in the currently-displayed render (via its signature).
  const { data: renders } = await supabaseAdmin
    .from("restyle_renders").select("signature, image_url").eq("restyle_id", id);
  const current = (renders ?? []).find((r) => r.image_url === restyle.current_url);
  const signatureIds = current ? new Set(current.signature.split(",")) : null;

  const { data: allEdits } = await supabaseAdmin
    .from("restyle_edits").select("*").eq("restyle_id", id);
  const products = ((allEdits ?? []) as RestyleEdit[]).filter(
    (e) => e.buy_url && (signatureIds ? signatureIds.has(e.id) : e.active),
  );
  const total = products.reduce((s, e) => s + parsePrice(e.product_price), 0);
  const priced = products.filter((e) => e.product_price).length;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold tracking-tight">Nook</Link>
          <Link href="/" className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">Design your own →</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {restyle.title && <h1 className="text-xl font-bold tracking-tight mb-4">{restyle.title}</h1>}
        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          {/* Room */}
          <div className="w-full lg:flex-1 min-w-0">
            <div className="rounded-2xl overflow-hidden bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={restyle.current_url} alt={restyle.title ?? "Room design"} className="block max-w-full max-h-[74vh] object-contain rounded-lg" />
            </div>
          </div>

          {/* Shop this look */}
          <div className="w-full lg:w-96 lg:shrink-0">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-slate-700" />
                <p className="text-sm font-semibold text-slate-800">Shop this look</p>
              </div>
              {products.length > 0 ? (
                <>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {products.length} item{products.length === 1 ? "" : "s"}
                    {priced > 0 && <> · from <span className="font-semibold text-slate-700">${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></>}
                  </p>
                  <div className="space-y-2">
                    {products.map((e) => (
                      <a key={e.id} href={e.buy_url ?? "#"} target="_blank" rel="noopener noreferrer"
                        className="flex gap-3 p-2.5 rounded-xl border border-[var(--border)] bg-white hover:border-slate-400 transition-colors">
                        {e.reference_url && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={e.reference_url} alt="" className="h-16 w-16 rounded-lg object-cover border border-[var(--border)] shrink-0 bg-[var(--muted)]" />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug capitalize">{e.product_title ?? e.target_label}</p>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            {e.product_price
                              ? <span className="font-semibold text-slate-800">{e.product_price}</span>
                              : <span className="font-medium text-slate-500">See price</span>}
                            <span className="text-[var(--muted-foreground)]">· {storeName(e.buy_url)}</span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                            View on {storeName(e.buy_url)} <ExternalLink className="h-3 w-3" />
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">No shoppable products in this design.</p>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[var(--border)] mt-8">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Created with Nook</span>
          <Link href="/" className="hover:text-slate-700 transition-colors">nook</Link>
        </div>
      </footer>
    </div>
  );
}
