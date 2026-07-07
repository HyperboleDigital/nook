export type PlanType = "free" | "starter" | "pro";

export type JobStatus = "pending" | "processing" | "complete" | "failed";

export type TourContentType = "splat" | "mesh";

export interface Tour {
  id: string;
  user_id: string;
  status: JobStatus;
  content_type: TourContentType;
  luma_capture_id: string | null;
  ply_url: string | null;
  model_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  title: string;
  public_slug: string;
  created_at: string;
}


export interface DetectedObject {
  label: string;
  /** [ymin, xmin, ymax, xmax], scaled 0–1000 relative to the image. */
  box_2d: [number, number, number, number];
}

export type RestyleEditKind = "item" | "style" | "remove" | "refine" | "add";

export interface RestyleEdit {
  id: string;
  restyle_id: string;
  kind: RestyleEditKind;
  target_label: string | null;
  instruction: string | null;
  reference_url: string | null;
  reference_desc: string | null;
  active: boolean;
  position: number;
  created_at: string;
  /** Source product URL for a "shop the look" edit — used for the Buy link. */
  buy_url: string | null;
  /** Product listing title, shown on the Buy button. */
  product_title: string | null;
  /** Product price string (e.g. "$899.00"), shown on the Buy button. */
  product_price: string | null;
  /** Pin for an "add" edit — 0–1000 coords in the original photo (box_2d space) + optional note.
   *  `w`/`h` (also 0–1000 units, half-width/half-height) are set only when this came from
   *  `locateItemInRoom`'s auto-locate (see the generate route) — they capture the ACTUAL detected
   *  item's extent so its canvas hotspot is properly sized instead of a generic small square. A
   *  manual tap-to-place pin has no `w`/`h`; canvasHotspots falls back to a fixed-size box then. */
  placement: { x: number; y: number; note?: string | null; w?: number; h?: number } | null;
}

export interface RestyleRender {
  id: string;
  restyle_id: string;
  signature: string;
  image_url: string;
  created_at: string;
}

export interface Restyle {
  id: string;
  user_id: string;
  title: string | null;
  original_url: string;
  current_url: string;
  width: number | null;
  height: number | null;
  detected_objects: DetectedObject[] | null;
  custom_items: string[] | null;
  /** Room type chosen at capture time (see /restyle/new) — nullable, set via migration 014. */
  room_type: string | null;
  /** Set when a generate is in-flight, cleared (null) when it finishes or fails — lets a
   *  fresh page load detect and resume showing progress. See migration 016. */
  generating_started_at: string | null;
  /** Error from the most recent generate attempt, if it failed while the user was away. */
  generate_error: string | null;
  created_at: string;
  updated_at: string;
  edits?: RestyleEdit[];
  renders?: RestyleRender[];
}

export interface UserProfile {
  id: string;
  clerk_id: string;
  email: string;
  stripe_customer_id: string | null;
  plan: PlanType;
  tours_used: number;
  reels_used: number;
  created_at: string;
}
