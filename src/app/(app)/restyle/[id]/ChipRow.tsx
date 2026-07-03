"use client";

import { Plus } from "lucide-react";
import type { RestyleWorkspace } from "./useRestyleWorkspace";
import { Chip, Skeleton } from "./ui";

/**
 * Horizontal row of tappable item chips — detected objects + custom items + "+ Add".
 * The sole entry point for sourcing once the canvas is showing a render (hotspot boxes
 * only map to the original photo, not a re-rendered one).
 */
export default function ChipRow({ ws }: { ws: RestyleWorkspace }) {
  const stagedLabels = new Set(ws.stagedItems.map((e) => e.target_label?.toLowerCase()).filter(Boolean));

  if (ws.detecting && ws.objects.length === 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-24 shrink-0" />)}
      </div>
    );
  }

  // A chip for something already staged opens the clean "similar items" list; an empty slot
  // goes straight to the link/photo/describe sourcing form since there's nothing to preview.
  const tap = (label: string) => {
    const edit = ws.stagedItems.find((e) => e.target_label?.toLowerCase() === label.toLowerCase());
    if (edit) ws.openSimilar(label, "swap", edit.id);
    else ws.openSourcing(label, "swap");
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {ws.objects.map((o) => (
        <Chip key={o.label} size="md"
          variant={ws.sourcing?.label === o.label ? "active" : "default"}
          staged={stagedLabels.has(o.label.toLowerCase())}
          onClick={() => tap(o.label)}>
          {o.label}
        </Chip>
      ))}
      {ws.customItems.map((label) => (
        <Chip key={label} size="md"
          variant={ws.sourcing?.label === label ? "active" : "default"}
          staged={stagedLabels.has(label.toLowerCase())}
          onClick={() => tap(label)}>
          {label}
        </Chip>
      ))}
      <Chip size="md" variant="dashed" onClick={() => ws.openSourcing("", "add")}>
        <Plus className="h-3.5 w-3.5" /> Add
      </Chip>
    </div>
  );
}
