-- Pin placement for "add" edits: {"x": 0-1000, "y": 0-1000, "note": string|null}
-- Same coordinate space as detected_objects box_2d.
alter table public.restyle_edits add column if not exists placement jsonb;

-- restyle_versions is dead — replaced by restyle_renders (007); nothing reads it.
drop table if exists public.restyle_versions;
