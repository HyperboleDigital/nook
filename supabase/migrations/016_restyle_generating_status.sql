-- Persisted generate-in-progress signal so a fresh page load can detect and resume showing
-- progress instead of the render finishing invisibly while the user is away.
alter table public.restyles add column if not exists generating_started_at timestamptz;
alter table public.restyles add column if not exists generate_error text;
