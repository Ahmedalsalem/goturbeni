-- Kullanıcı kararı (2026-11-01): telefon değişince hesap doğrulaması artık
-- sıfırlanmıyor. Bu kural SMS doğrulaması döneminden (0010) kalmaydı; hesap
-- 0035'ten beri e-posta koduyla doğrulanıyor, telefon doğrulanmıyor. Prod'da
-- Google ile kaydolan 4 hesap, profilde telefon ekleyince "doğrulanmamış"
-- olup takıldı (Google zaten e-postayı doğrulamış, 0078).
-- complete_registration_details da aynı nedenle mevcut doğrulamayı silmiyor:
-- yeni satır yine false ile açılıyor, e-posta kaydının akışı değişmiyor.
--
-- 0099 bu iki fonksiyonu security definer yaptı; create or replace bu
-- ayarı gövdedeki tanımdan aldığı için burada açıkça yazılıyor.
create or replace function public.update_own_profile(
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
  p_car_color text,
  p_car_features text[],
  p_custom_car_features text[],
  p_email_notifications_enabled boolean
)
returns void
language plpgsql
security definer
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
        car_color = p_car_color,
        car_features = p_car_features,
        custom_car_features = p_custom_car_features
    where id = auth.uid();

  insert into public.profiles_private (id, phone, email_verified, iban, iban_holder_name, email_notifications_enabled)
  values (auth.uid(), p_phone, false, p_iban, p_iban_holder_name, p_email_notifications_enabled)
  on conflict (id) do update
    set phone = excluded.phone,
        iban = excluded.iban,
        iban_holder_name = excluded.iban_holder_name,
        email_notifications_enabled = excluded.email_notifications_enabled;
end;
$$;

create or replace function public.complete_registration_details(
  p_gender text,
  p_phone text,
  p_full_name text default null,
  p_date_of_birth date default null,
  p_email_notifications_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles_private (id, gender, phone, email_verified, date_of_birth, email_notifications_enabled)
  values (auth.uid(), p_gender::public.profile_gender, p_phone, false, p_date_of_birth, p_email_notifications_enabled)
  on conflict (id) do update
    set gender = excluded.gender,
        phone = excluded.phone,
        date_of_birth = coalesce(excluded.date_of_birth, profiles_private.date_of_birth),
        email_notifications_enabled = excluded.email_notifications_enabled;

  if p_full_name is not null then
    update public.profiles
    set full_name = p_full_name
    where id = auth.uid();
  end if;
end;
$$;
