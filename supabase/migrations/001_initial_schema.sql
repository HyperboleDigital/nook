-- Users (synced from Clerk via webhook)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  email text not null,
  stripe_customer_id text,
  plan text not null default 'free' check (plan in ('free', 'starter', 'pro')),
  tours_used integer not null default 0,
  reels_used integer not null default 0,
  created_at timestamptz not null default now()
);

-- 3D Tours
create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  luma_capture_id text,
  ply_url text,
  thumbnail_url text,
  title text not null,
  public_slug text unique not null,
  created_at timestamptz not null default now()
);

-- Reels
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  higgsfield_generation_id text,
  output_url text,
  thumbnail_url text,
  title text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.tours enable row level security;
alter table public.reels enable row level security;

-- Tours: users can read their own
create policy "users_read_own_tours"
  on public.tours for select
  using (auth.uid()::text = user_id);

-- Reels: users can read their own
create policy "users_read_own_reels"
  on public.reels for select
  using (auth.uid()::text = user_id);

-- Public tours: anyone can read complete tours by slug (for shared links)
create policy "public_read_complete_tours"
  on public.tours for select
  using (status = 'complete');

-- Storage bucket for uploads
insert into storage.buckets (id, name, public) values ('nook-uploads', 'nook-uploads', true)
  on conflict do nothing;
