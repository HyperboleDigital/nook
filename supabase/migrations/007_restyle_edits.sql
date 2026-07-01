-- Toggleable "change layers" for Room Restyle. Each edit is a recorded change;
-- the visible image = the original re-rendered with the currently-active edits.
-- restyle_renders caches each active-set combination so toggling is instant.

create table if not exists public.restyle_edits (
  id uuid primary key default gen_random_uuid(),
  restyle_id uuid not null references public.restyles(id) on delete cascade,
  kind text not null default 'item' check (kind in ('item', 'style', 'remove', 'refine')),
  target_label text,            -- the item being changed (for kind 'item')
  instruction text,             -- free-text direction / style
  reference_url text,           -- optional reference photo for the change
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.restyle_renders (
  id uuid primary key default gen_random_uuid(),
  restyle_id uuid not null references public.restyles(id) on delete cascade,
  signature text not null,      -- active edit ids in order; identifies a combination
  image_url text not null,
  created_at timestamptz not null default now(),
  unique (restyle_id, signature)
);

create index if not exists restyle_edits_restyle_id_idx on public.restyle_edits(restyle_id);
create index if not exists restyle_renders_restyle_id_idx on public.restyle_renders(restyle_id);

alter table public.restyle_edits enable row level security;
alter table public.restyle_renders enable row level security;
