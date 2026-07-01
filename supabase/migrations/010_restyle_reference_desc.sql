-- Auto-generated, item-aware description of a reference product, injected into the
-- replacement prompt so swaps reproduce the reference's real proportions/details.
alter table public.restyle_edits
  add column if not exists reference_desc text;
