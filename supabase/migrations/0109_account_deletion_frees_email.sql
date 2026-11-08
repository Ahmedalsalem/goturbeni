-- A deleted account kept its auth.users email and Google identity, so the
-- same address could never sign up again ("already registered") although the
-- /account-deleted page says a new account can be created. The auth.users
-- row itself must stay: rides, bookings, messages and reviews cascade from it
-- and other users' history depends on them. Instead the email is replaced
-- with a unique placeholder, the identities (email + Google) are removed and
-- the Google profile metadata (name, photo URL) is cleared.
--
-- The avatar files are removed by deleteOwnAccount through the Storage API
-- before this runs; Storage refuses direct SQL deletes from storage.objects.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set full_name = null,
      avatar_url = null,
      bio = null,
      car_brand = null,
      car_model = null,
      car_plate = null,
      car_color = null,
      car_features = '{}',
      custom_car_features = '{}',
      deleted_at = now()
  where id = v_uid;

  update public.profiles_private
  set phone = null,
      email_verified = false,
      gender = null,
      iban = null,
      iban_holder_name = null,
      date_of_birth = null,
      email_notifications_enabled = false
  where id = v_uid;

  delete from auth.identities where user_id = v_uid;

  update auth.users
  set email = 'deleted+' || v_uid::text || '@deleted.invalid',
      phone = null,
      raw_user_meta_data = '{}'::jsonb,
      updated_at = now()
  where id = v_uid;
end;
$$;
