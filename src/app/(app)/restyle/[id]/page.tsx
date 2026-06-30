"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useRestyleWorkspace } from "./useRestyleWorkspace";
import RestyleWizard from "./RestyleWizard";
import RestyleResult from "./RestyleResult";

export default function RestyleWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useRestyleWorkspace(id);

  // Editing re-enters the same simple guided steps (no photo upload, no advanced panel),
  // starting at "what do you want to add/change". `editBase` is the image to build on.
  const [editing, setEditing] = useState(false);
  const [editBase, setEditBase] = useState<string | null>(null);

  if (ws.loading || !ws.restyle) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-[var(--muted-foreground)]">
          <span className="h-7 w-7 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin inline-block" />
          <span className="text-sm">Setting up your room…</span>
        </div>
      </div>
    );
  }

  const hasRenders = ws.renders.length > 0;
  const original = ws.restyle.original_url;

  // Edit the current result: keep the active edits, build on top of them.
  const editThis = () => { ws.setPreviewUrl(null); setEditBase(ws.restyle!.current_url); setEditing(true); };
  // Edit from the bare original: deactivate every edit (non-destructive — old renders keep
  // their products via signature), so the steps start from a clean room.
  const editOriginal = async () => {
    setEditBase(original); setEditing(true); ws.setPreviewUrl(original);
    for (const e of ws.activeEdits) await ws.toggle(e.id, false);
  };
  const exitEdit = () => { setEditing(false); ws.setPreviewUrl(null); };

  const showWizard = editing || !hasRenders;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5">
        <div className="min-w-0">
          <Link href="/restyle" className="text-xs text-[var(--muted-foreground)] hover:text-slate-700 transition-colors">
            ← All restyles
          </Link>
          <input
            value={ws.titleDraft}
            onChange={e => ws.setTitleDraft(e.target.value)}
            onBlur={() => ws.saveTitle(ws.titleDraft)}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="Untitled Room"
            className="block w-full bg-transparent text-xl font-bold tracking-tight focus:outline-none focus:underline placeholder:text-slate-300 mt-0.5"
          />
        </div>
      </div>

      {showWizard ? (
        editing ? (
          <RestyleWizard
            key={`edit-${editBase}`}
            ws={ws}
            startStep={2}
            minStep={2}
            initialMode="restyle"
            baseImageUrl={editBase ?? original}
            onDone={exitEdit}
            onCancel={exitEdit}
          />
        ) : (
          <RestyleWizard
            ws={ws}
            startStep={ws.edits.length > 0 ? 4 : 1}
            onDone={() => { /* renders now exist → result view shows automatically */ }}
          />
        )
      ) : (
        <RestyleResult ws={ws} onEditThis={editThis} onEditOriginal={editOriginal} />
      )}
    </div>
  );
}
