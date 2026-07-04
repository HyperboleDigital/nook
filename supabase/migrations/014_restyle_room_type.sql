-- Room type chosen at capture time (Phase 1 capture wizard). Nullable — older
-- projects and skipped pickers have no value. Free-form text validated app-side
-- against: living_room, bedroom, dining, home_office, multi_use, other.
alter table public.restyles
  add column if not exists room_type text;
