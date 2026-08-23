-- Kullanıcı denetiminde bulunan 3 madde:
-- 1) Yeni ilan duyuru maili artık her profile_private.email_notifications_enabled
--    = false olan kullanıcıyı atlıyor; kayıt formunda bunun için bir onay
--    kutusu var (varsayılan işaretsiz — gerçek bir "izin" olsun diye).
-- 2) Kayıt formuna doğum tarihi eklendi, 18 yaş altı signUp Zod şemasında
--    reddediliyor (features/auth/schemas.ts) — burada sadece veriyi taşıyacak
--    sütun var, yaş kısıtı kasıtlı olarak DB seviyesinde değil (bkz.
--    features/profile/schemas.ts'teki IBAN format regex'i gibi, bu da yalnızca
--    app katmanında; DB'de sadece char_length gibi basit sınırlar var).
-- 3) Gizlilik metninde vaat edilen ("hesabınızı sildiğinizde verileriniz
--    silinir") ama var olmayan hesap silme özelliği: delete_own_account,
--    admin_set_suspended'ın "gerçek bir ban değil, service_role gerektirir"
--    notuyla aynı sınırlamaya tabi (0014_admin.sql) — auth.users satırı
--    silinmiyor/BAN'lanmıyor, bunun yerine profiles/profiles_private
--    anonimleştirilip profiles.deleted_at damgalanıyor; dal.ts'teki
--    verifySession bunu is_suspended ile aynı noktada kontrol edip
--    /account-deleted'e yönlendiriyor, signIn de aynısını yapıyor.

alter table public.profiles
  add column deleted_at timestamptz;

alter table public.profiles_private
  add column date_of_birth date,
  add column email_notifications_enabled boolean not null default true;

-- complete_registration_details: p_full_name zaten opsiyonel olmalıydı —
-- features/profile/actions.ts'teki completeMandatoryProfileDetails (legacy
-- hesaplar için gender/phone tamamlama akışı) bu RPC'yi p_full_name VERMEDEN
-- çağırıyordu, 0069'un 3 parametreyi de zorunlu kılan imzası bunu üretimde
-- "function does not exist" ile kırıyordu (bu migration'ın hazırlığı
-- sırasında fark edildi). p_full_name default null olunca, sadece
-- gönderildiğinde güncelleniyor.
drop function public.complete_registration_details(text, text, text);

create function public.complete_registration_details(
  p_gender text,
  p_phone text,
  p_full_name text default null,
  p_date_of_birth date default null,
  p_email_notifications_enabled boolean default true
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.profiles_private (id, gender, phone, phone_verified, date_of_birth, email_notifications_enabled)
  values (auth.uid(), p_gender::public.profile_gender, p_phone, false, p_date_of_birth, p_email_notifications_enabled)
  on conflict (id) do update
    set gender = excluded.gender,
        phone = excluded.phone,
        phone_verified = false,
        date_of_birth = coalesce(excluded.date_of_birth, profiles_private.date_of_birth),
        email_notifications_enabled = excluded.email_notifications_enabled;

  if p_full_name is not null then
    update public.profiles
    set full_name = p_full_name
    where id = auth.uid();
  end if;
end;
$$;

-- update_own_profile: p_email_notifications_enabled eklendi (profil
-- sayfasındaki toggle bunu her zaman gönderir, default yok).
drop function public.update_own_profile(text, text, text, text, text, text, text, text, text, text, text[], text[]);

create function public.update_own_profile(
  p_full_name text,
  p_bio text,
  p_language text,
  p_avatar_url text,
  p_phone text,
  p_iban text,
  p_iban_holder_name text,
  p_car_brand text,
  p_car_model text,
  p_car_plate text,
  p_car_features text[],
  p_custom_car_features text[],
  p_email_notifications_enabled boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles
    set full_name = p_full_name,
        bio = p_bio,
        language = p_language,
        avatar_url = coalesce(p_avatar_url, avatar_url),
        car_brand = p_car_brand,
        car_model = p_car_model,
        car_plate = p_car_plate,
        car_features = p_car_features,
        custom_car_features = p_custom_car_features
    where id = auth.uid();

  insert into public.profiles_private (id, phone, phone_verified, iban, iban_holder_name, email_notifications_enabled)
  values (auth.uid(), p_phone, false, p_iban, p_iban_holder_name, p_email_notifications_enabled)
  on conflict (id) do update
    set phone = excluded.phone,
        phone_verified = case
          when profiles_private.phone is distinct from excluded.phone then false
          else profiles_private.phone_verified
        end,
        iban = excluded.iban,
        iban_holder_name = excluded.iban_holder_name,
        email_notifications_enabled = excluded.email_notifications_enabled;
end;
$$;

-- get_all_member_emails_for_broadcast (0067): artık email_notifications_enabled
-- = false olanları ve silinmiş hesapları (deleted_at not null) atlıyor.
create or replace function public.get_all_member_emails_for_broadcast(p_ride_id uuid)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id and posted_by = auth.uid();
  if not found then
    return;
  end if;

  insert into public.ride_broadcast_dispatches (ride_id) values (p_ride_id)
  on conflict (ride_id) do nothing;
  if not found then
    return;
  end if;

  return query
    select p.id, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles_private pp on pp.id = p.id
    where p.id <> v_ride.posted_by
      and p.deleted_at is null
      and coalesce(pp.email_notifications_enabled, true);
end;
$$;

-- delete_own_account: auth.users satırına dokunmuyor (0014_admin.sql'deki
-- aynı service_role kısıtı) — profiles/profiles_private'ı anonimleştirip
-- deleted_at damgalıyor. full_name/avatar_url null bırakılınca mevcut UI
-- fallback etiketleri (Bookings.card.unknownDriver/unknownPassenger vb.)
-- zaten "silinmiş kullanıcı" gibi görünen bir isim üretiyor, ayrı bir i18n
-- string'i gerekmiyor.
create function public.delete_own_account()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles
  set full_name = null,
      avatar_url = null,
      bio = null,
      car_brand = null,
      car_model = null,
      car_plate = null,
      car_features = '{}',
      custom_car_features = '{}',
      deleted_at = now()
  where id = auth.uid();

  update public.profiles_private
  set phone = null,
      phone_verified = false,
      gender = null,
      iban = null,
      iban_holder_name = null,
      date_of_birth = null,
      email_notifications_enabled = false
  where id = auth.uid();
end;
$$;
