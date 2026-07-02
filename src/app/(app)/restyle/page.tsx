"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Sofa, Trash2 } from "lucide-react";
import { Button, IconButton, Skeleton, Spinner } from "./[id]/ui";

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
          <h1 className="text-2xl font-bold tracking-tight -tracking-[0.02em] mb-1">Room Restyle</h1>
          <p className="text-[var(--muted-foreground)] text-sm">
            Reimagine any room, then fine-tune it piece by piece.
          </p>
        </div>
        <Link href="/restyle/new">
          <Button variant="primary" className="whitespace-nowrap">
            <Plus className="h-4 w-4" /> New restyle
          </Button>
        </Link>
      </div>

      {items === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/3]" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-[var(--border)] p-16 text-center">
          <Sofa className="h-8 w-8 mx-auto mb-3 text-[var(--muted-foreground)]" strokeWidth={1.5} />
          <p className="text-sm text-[var(--muted-foreground)] mb-4">No restyles yet.</p>
          <Link href="/restyle/new">
            <Button variant="primary" size="sm">Start your first one →</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {items.map((r) => (
            <div key={r.id} className="group relative border border-[var(--border)] hover:border-[var(--foreground)] transition-colors">
              <Link href={`/restyle/${r.id}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.current_url} alt={r.title ?? "Restyle"} className="aspect-[4/3] w-full object-cover bg-[var(--muted)]" />
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{r.title ?? "Untitled"}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{new Date(r.updated_at).toLocaleDateString()}</div>
                </div>
              </Link>
              <IconButton disabled={deleting === r.id}
                onClick={() => remove(r.id, r.title)}
                aria-label="Delete room"
                className="absolute top-2 right-2 bg-white/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:border-red-300 transition-opacity">
                {deleting === r.id ? <Spinner size="xs" /> : <Trash2 className="h-3.5 w-3.5" />}
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
