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
