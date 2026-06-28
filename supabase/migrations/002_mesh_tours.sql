-- Mesh tours: support GLB dollhouse models alongside PLY Gaussian splats.
-- A "mesh" tour holds a pre-generated GLB (from Meshy/Rodin/Tripo) rendered by
-- <model-viewer>, vs a "splat" tour holding a PLY rendered by the SuperSplat viewer.

-- Discriminator: which kind of 3D content this tour holds.
alter table public.tours
  add column if not exists content_type text not null default 'splat'
    check (content_type in ('splat', 'mesh'));

-- GLB URL for mesh tours (parallels ply_url for splats).
alter table public.tours
  add column if not exists model_url text;

-- Source video URL (the app already writes this on splat tours; column was
-- missing from 001_initial_schema.sql).
alter table public.tours
  add column if not exists video_url text;
