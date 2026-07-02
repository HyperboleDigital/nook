-- Server-persisted product-search results, one row per (restyle, item label).
-- Replaces the client's per-device localStorage cache so results survive reloads
-- and are shared across devices; also lets search respond fast with unscored
-- results and fill in Gemini scoring + resolved Wayfair links in the background.
create table if not exists public.restyle_searches (
  id uuid primary key default gen_random_uuid(),
  restyle_id uuid not null references public.restyles(id) on delete cascade,
  label text not null,                 -- lowercase item label ('' allowed until identified)
  query text,                          -- the text query used, if any
  results jsonb not null default '[]', -- ShoppingResult[]
  scored boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (restyle_id, label)
);

create index if not exists restyle_searches_restyle_id_idx on public.restyle_searches(restyle_id);

alter table public.restyle_searches enable row level security;
