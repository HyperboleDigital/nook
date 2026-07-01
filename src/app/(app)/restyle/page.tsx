"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface RestyleCard {
  id: string;
  title: string | null;
  current_url: string;
  updated_at: string;
}

export default function RestyleHistoryPage() {
  const [items, setItems] = useState<RestyleCard[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/restyles")
      .then((r) => r.json())
      .then((d) => setItems(d.restyles ?? []))
      .catch(() => setItems([]));
  }, []);

  const remove = async (id: string, title: string | null) => {
    if (!confirm(`Delete "${title ?? "Untitled"}"? This can't be undone.`)) return;
    setDeleting(id);
    const prev = items;
    setItems((cur) => cur?.filter((r) => r.id !== id) ?? cur); // optimistic
    try {
      const res = await fetch(`/api/restyles/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev ?? null); // restore on failure
      alert("Couldn't delete that room. Try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Room Restyle</h1>
          <p className="text-[var(--muted-foreground)] text-sm">
            Reimagine any room, then fine-tune it piece by piece.
          </p>
        </div>
        <Link href="/restyle/new" className="bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl hover:opacity-90 whitespace-nowrap">
          + New restyle
        </Link>
      </div>

      {items === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] bg-[var(--muted)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] rounded-2xl p-16 text-center">
          <div className="text-3xl mb-3">🛋️</div>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">No restyles yet.</p>
          <Link href="/restyle/new" className="text-sm bg-slate-900 text-white px-4 py-2 rounded-lg hover:opacity-90">
            Start your first one →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map((r) => (
            <div key={r.id} className="group relative rounded-xl overflow-hidden border border-[var(--border)] hover:border-slate-400 transition-colors">
              <Link href={`/restyle/${r.id}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.current_url} alt={r.title ?? "Restyle"} className="aspect-[4/3] w-full object-cover bg-[var(--muted)]" />
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{r.title ?? "Untitled"}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{new Date(r.updated_at).toLocaleDateString()}</div>
                </div>
              </Link>
              <button type="button" disabled={deleting === r.id}
                onClick={() => remove(r.id, r.title)}
                aria-label="Delete room"
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white/90 backdrop-blur-sm border border-[var(--border)] text-slate-500 shadow-sm flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:border-red-300 disabled:opacity-50 transition-all">
                {deleting === r.id
                  ? <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                  : <span className="text-base leading-none">🗑</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
