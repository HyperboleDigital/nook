-- User-typed "custom items" (things the detector missed) kept as a small managed
-- list per project so they can be shown distinctly, removed, and capped.
alter table public.restyles
  add column if not exists custom_items jsonb not null default '[]'::jsonb;
