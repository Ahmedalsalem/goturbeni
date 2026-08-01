-- Kullanıcı talebi: araç plakası da profile eklensin. car_brand/car_model
-- (0018) ile aynı gerekçe — hassas veri değil, yolcunun doğru aracı teşhis
-- edebilmesi için ilan/profil sayfasında herkese açık gösterilmesi bekleniyor,
-- bu yüzden profiles_private değil, profiles.

alter table public.profiles
  add column car_plate text check (char_length(car_plate) <= 15);

-- update_own_profile'a car_plate eklenir. Parametre listesi değiştiği için
-- (0017/0018'deki gibi) önce eski imza düşürülüp yeni bir overload oluşturulur.
drop function public.update_own_profile(text, text, text, text, text, text, text, text, text);

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
  p_car_plate text
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
        car_plate = p_car_plate
    where id = auth.uid();

  insert into public.profiles_private (id, phone, phone_verified, iban, iban_holder_name)
  values (auth.uid(), p_phone, false, p_iban, p_iban_holder_name)
  on conflict (id) do update
    set phone = excluded.phone,
        phone_verified = case
          when profiles_private.phone is distinct from excluded.phone then false
          else profiles_private.phone_verified
        end,
        iban = excluded.iban,
        iban_holder_name = excluded.iban_holder_name;
end;
$$;
