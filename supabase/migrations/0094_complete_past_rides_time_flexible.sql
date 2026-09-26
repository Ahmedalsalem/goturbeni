-- complete_past_rides (0011) compared raw departure_time < now() for every
-- ride, but a time_flexible passenger listing's departure_time is a
-- meaningless placeholder (RideForm fills it once, then hides the field —
-- see schemas.ts's own departureInPast refine, which already treats a
-- flexible listing's real deadline as 23:59 Europe/Istanbul on the
-- departure date, not the placeholder clock time). The cron never got that
-- same exception, so a flexible listing was auto-marked "completed" within
-- ~1 minute of being posted (seen live: two rides created 2026-09-26,
-- completed by the very next cron tick).
create or replace function public.complete_past_rides()
returns void
language sql
security definer
set search_path = public
as $$
  update public.rides
  set status = 'completed'
  where status in ('active', 'full')
    and (
      (not time_flexible and departure_time < now())
      or (
        time_flexible
        and (now() at time zone 'Europe/Istanbul')::date
          > (departure_time at time zone 'Europe/Istanbul')::date
      )
    );
$$;
