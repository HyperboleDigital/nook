-- Cache detected objects per restyle version so tap-to-select editing doesn't
-- re-run (and re-bill) Gemini detection every time the user opens "Edit items".
alter table public.restyle_versions
  add column if not exists objects jsonb;
