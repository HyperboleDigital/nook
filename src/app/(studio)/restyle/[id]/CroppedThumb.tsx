"use client";

import type { DetectedObject } from "@/types";

/**
 * Crops a region out of a full photo using only CSS (no canvas/server round-trip) — sizes
 * and positions the full image so the box_2d region exactly fills the container. Used to show
 * "here's the actual ceiling fan in your photo" next to a swap's label, instead of just text.
 */
export default function CroppedThumb({
  imageUrl, box_2d, className,
}: { imageUrl: string; box_2d: DetectedObject["box_2d"]; className?: string }) {
  const [ymin, xmin, ymax, xmax] = box_2d;
  const boxW = Math.max(xmax - xmin, 1);
  const boxH = Math.max(ymax - ymin, 1);
  const widthPct = 100_000 / boxW;
  const heightPct = 100_000 / boxH;
  const leftPct = (-100 * xmin) / boxW;
  const topPct = (-100 * ymin) / boxH;

  return (
    <div className={className ?? "h-16 w-16"} style={{ position: "relative", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        style={{ position: "absolute", left: `${leftPct}%`, top: `${topPct}%`, width: `${widthPct}%`, height: `${heightPct}%`, maxWidth: "none" }}
      />
    </div>
  );
}
