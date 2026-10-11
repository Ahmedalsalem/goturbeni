-- Security fixes from AUDIT_REPORT.md (GB-FN-001, GB-PRIV-002, GB-SEC-010).

-- GB-FN-001: once a ride has an approved passenger, its price and departure
-- time are what that passenger agreed to — and settlement reads the ride's
-- current cost_share, so a later edit silently changed what they owe.
-- updateRide (src/features/rides/actions.ts) refuses this with a clear
-- message; this trigger enforces it for direct Data API updates too.
-- Only API roles are blocked: approve_booking legitimately rewrites
-- cost_share for an accepted passenger-listing offer (0090) and runs as the
-- SECURITY DEFINER owner.
create function public.prevent_locked_ride_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
    and (
      new.cost_share is distinct from old.cost_share
      or new.departure_time is distinct from old.departure_time
      or new.departure_time_range_end is distinct from old.departure_time_range_end
    )
    and exists (select 1 from public.bookings b where b.ride_id = old.id and b.status = 'approved')
  then
    raise exception 'ride_locked_after_approval';
  end if;
  return new;
end;
$$;

create trigger prevent_locked_ride_changes
  before update on public.rides
  for each row execute function public.prevent_locked_ride_changes();

-- GB-PRIV-002: get_female_driver_ride_ids let anyone, logged out, list
-- which rides have a female driver — driver gender is personal data.
-- The search filter stays available to signed-in users.
revoke execute on function public.get_female_driver_ride_ids() from public, anon;
grant execute on function public.get_female_driver_ride_ids() to authenticated;

-- GB-SEC-010: both buckets accepted any file type and size over the Data
-- API (the app's own checks only cover its server actions). Mirrors the
-- limits in src/features/profile/actions.ts and src/features/bookings/actions.ts.
update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'avatars';

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  where id = 'payment-receipts';
