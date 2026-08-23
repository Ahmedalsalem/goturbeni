-- Tek "Klimalı" checkbox'ı yerine: ~10 sabit araç özelliği (car_features,
-- CAR_FEATURE_KEYS ile eşleşen sabit anahtarlar) + sürücünün kendi
-- ekleyebileceği serbest metin özellikler (custom_car_features). Sadece
-- gösterim amaçlı (profil formu + ilan kartı rozeti) — has_ac'in aksine
-- artık bir /rides arama filtresi değil (features/rides/queries.ts'teki
-- resolveHasAcRideIds ve ilgili filtre UI'ı bu değişiklikle kaldırılıyor).
alter table public.profiles
  add column car_features text[] not null default '{}',
  add column custom_car_features text[] not null default '{}';

update public.profiles set car_features = array['ac'] where has_ac;

alter table public.profiles drop column has_ac;

-- update_own_profile: p_has_ac yerine p_car_features/p_custom_car_features.
-- Parametre imzası değiştiği için (0018/0050/0066'daki gibi) önce eski
-- imza düşürülüp yeni bir overload oluşturulur.
drop function public.update_own_profile(text, text, text, text, text, text, text, text, text, text, boolean);

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
  p_custom_car_features text[]
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
