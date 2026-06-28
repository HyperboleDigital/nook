-- Store the reference photo used for a version (for an informative history:
-- "what changed" = label, "what was referenced" = reference_url).
alter table public.restyle_versions
  add column if not exists reference_url text;
