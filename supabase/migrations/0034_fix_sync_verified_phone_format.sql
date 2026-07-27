-- sync_verified_phone (0010_phone_verification.sql) writes auth.users.phone
-- verbatim into profiles_private.phone. GoTrue stores phone without a "+"
-- prefix (e.g. "905551234567"), while every other write path in this app
-- (signup, /verify-phone completion, profile edits) normalizes through
-- libphonenumber-js to E.164 with the "+" ("+905551234567") before storing.
--
-- This mismatch is latent until something actually compares the two: when
-- the local/CI Supabase instance has auth.sms.enable_confirmations = false
-- (see supabase/config.toml), the very first successful phone-claim gets
-- auto-confirmed, the trigger fires, and profiles_private.phone flips to
-- the no-"+" format for that user — update_own_profile's "did the phone
-- change" check (0018_ride_trip_preferences.sql) then sees the normalized
-- E.164 value submitted on the next profile save as *different* from the
-- stored no-"+" value and silently resets phone_verified to false.
create or replace function public.sync_verified_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_confirmed_at is not null then
    insert into public.profiles_private (id, phone, phone_verified)
    values (new.id, case when new.phone like '+%' then new.phone else '+' || new.phone end, true)
    on conflict (id) do update
      set phone = case when new.phone like '+%' then new.phone else '+' || new.phone end,
          phone_verified = true;
  end if;
  return new;
end;
$$;
