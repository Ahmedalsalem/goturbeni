-- Kullanıcı talebi: araç rengi de profile eklensin ve car_plate (0050) gibi
-- ilan verebilmek için zorunlu tutulsun — yolcunun doğru aracı teşhis
-- edebilmesi için. Hassas veri değil, car_brand/car_model/car_plate ile aynı
-- gerekçeyle profiles_private değil, herkese açık profiles tablosuna eklenir.

alter table public.profiles
  add column car_color text check (char_length(car_color) <= 30);

-- update_own_profile'a car_color eklenir. Parametre listesi değiştiği için
-- (0050/0070/0075'teki gibi) önce eski imza düşürülüp yeni bir overload
-- oluşturulur.
drop function public.update_own_profile(text, text, text, text, text, text, text, text, text, text, text[], text[], boolean);

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

-- delete_own_account (0075): car_color de anonimleştirilirken temizlenir.
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
      phone_verified = false,
      gender = null,
      iban = null,
      iban_holder_name = null,
      date_of_birth = null,
      email_notifications_enabled = false
  where id = auth.uid();
end;
$$;
