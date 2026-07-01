-- Allow 'add' as a valid edit kind (for adding new objects to the room).
alter table public.restyle_edits
  drop constraint if exists restyle_edits_kind_check;
alter table public.restyle_edits
  add constraint restyle_edits_kind_check
  check (kind in ('item', 'style', 'remove', 'refine', 'add'));
