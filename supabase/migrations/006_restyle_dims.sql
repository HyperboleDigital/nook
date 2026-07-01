-- Canonical dimensions for a restyle project. Every generated image is normalized
-- to these so all versions (and the before/after slider) share one exact ratio.
alter table public.restyles add column if not exists width int;
alter table public.restyles add column if not exists height int;
