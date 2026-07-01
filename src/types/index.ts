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

export interface Reel {
  id: string;
  user_id: string;
  status: JobStatus;
  higgsfield_generation_id: string | null;
  output_url: string | null;
  thumbnail_url: string | null;
  title: string;
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
}

export interface RestyleVersion {
  id: string;
  restyle_id: string;
  image_url: string;
  label: string | null;
  /** Reference photo used for this edit, if any. */
  reference_url: string | null;
  /** Cached object detection for this image (tap-to-select editing). */
  objects: DetectedObject[] | null;
  created_at: string;
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
  created_at: string;
  updated_at: string;
  versions?: RestyleVersion[];
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
