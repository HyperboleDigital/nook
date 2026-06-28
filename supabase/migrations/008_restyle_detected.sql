-- Persist the detected item list per project so it's stable. Detection is AI and
-- non-deterministic; without saving it, the item chips changed on every reload.
alter table public.restyles
  add column if not exists detected_objects jsonb;
