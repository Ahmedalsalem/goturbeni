-- phone_verified artık yanıltıcı bir isim: telefon hiç doğrulanmıyor, hesap
-- e-posta koduyla doğrulanıyor (bkz. 0035_email_based_verification.sql).
-- Kolon gerçek anlamına uysun diye yeniden adlandırılıyor. RLS politikaları
-- Postgres'in kolon-yeniden-adlandırma mekanizmasıyla otomatik güncellenir,
-- ama plpgsql fonksiyon gövdeleri düz metin olduğundan (0018/0034/0035/0050/
-- 0066/0069/0070/0075/0076'daki gibi) kolonu referans alan her canlı
-- fonksiyon burada aynı imzayla yeniden oluşturuluyor.

alter table public.profiles_private rename column phone_verified to email_verified;

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
        car_color = p_car_color,
        car_features = p_car_features,
        custom_car_features = p_custom_car_features
    where id = auth.uid();

  insert into public.profiles_private (id, phone, email_verified, iban, iban_holder_name, email_notifications_enabled)
  values (auth.uid(), p_phone, false, p_iban, p_iban_holder_name, p_email_notifications_enabled)
  on conflict (id) do update
    set phone = excluded.phone,
        email_verified = case
          when profiles_private.phone is distinct from excluded.phone then false
          else profiles_private.email_verified
        end,
        iban = excluded.iban,
        iban_holder_name = excluded.iban_holder_name,
        email_notifications_enabled = excluded.email_notifications_enabled;
end;
$$;

create or replace function public.verify_email_otp(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched boolean;
begin
  update public.profiles_private
    set email_verified = true,
        email_otp_code = null,
        email_otp_expires_at = null
    where id = auth.uid()
      and email_otp_code = p_code
      and email_otp_expires_at > now();

  v_matched := found;
  return v_matched;
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
security invoker
set search_path = public
as $$
begin
  insert into public.profiles_private (id, gender, phone, email_verified, date_of_birth, email_notifications_enabled)
  values (auth.uid(), p_gender::public.profile_gender, p_phone, false, p_date_of_birth, p_email_notifications_enabled)
  on conflict (id) do update
    set gender = excluded.gender,
        phone = excluded.phone,
        email_verified = false,
        date_of_birth = coalesce(excluded.date_of_birth, profiles_private.date_of_birth),
        email_notifications_enabled = excluded.email_notifications_enabled;

  if p_full_name is not null then
    update public.profiles
    set full_name = p_full_name
    where id = auth.uid();
  end if;
end;
$$;

create or replace function public.delete_own_account()
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
      car_color = null,
      car_features = '{}',
      custom_car_features = '{}',
      deleted_at = now()
  where id = auth.uid();

  update public.profiles_private
  set phone = null,
      email_verified = false,
      gender = null,
      iban = null,
      iban_holder_name = null,
      date_of_birth = null,
      email_notifications_enabled = false
  where id = auth.uid();
end;
$$;
