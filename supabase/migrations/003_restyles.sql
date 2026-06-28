-- Room Restyle history. A "restyle" is a project started from one room photo;
-- each edit (theme, refine, remove-furniture, per-item change) appends a version.

create table if not exists public.restyles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(clerk_id) on delete cascade,
  title text,
  original_url text not null,   -- the uploaded room photo
  current_url text not null,    -- the latest result shown
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restyle_versions (
  id uuid primary key default gen_random_uuid(),
  restyle_id uuid not null references public.restyles(id) on delete cascade,
  image_url text not null,
  label text,                   -- what changed, e.g. "Scandinavian", "Removed furniture"
  created_at timestamptz not null default now()
);

create index if not exists restyles_user_id_idx on public.restyles(user_id);
create index if not exists restyle_versions_restyle_id_idx on public.restyle_versions(restyle_id);

-- RLS on for convention; the app reads via the service role (supabaseAdmin),
-- filtering by user_id in code (same pattern as tours).
alter table public.restyles enable row level security;
alter table public.restyle_versions enable row level security;

create policy "users_read_own_restyles"
  on public.restyles for select
  using (auth.uid()::text = user_id);
