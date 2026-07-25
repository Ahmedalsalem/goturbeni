-- Sürücü aracı (marka/model, profilde — bkz. "Neden profilde?" notu
-- aşağıda) ve ilan bazlı yolculuk tercihleri: evcil hayvan / sigara kabulü,
-- VIP (tek yolcu) ilanlar.

-- Araç marka/modeli hassas bir veri değildir (telefon/IBAN'ın aksine),
-- diğer kullanıcıların ilan/profil sayfasında görmesi beklenir — bu yüzden
-- 0006/0016'daki gibi profiles_private'a değil, herkese açık profiles
-- tablosuna eklenir.
alter table public.profiles
  add column car_brand text check (char_length(car_brand) <= 50),
  add column car_model text check (char_length(car_model) <= 50);

alter table public.rides
  add column pets_allowed boolean not null default false,
  add column smoking_allowed boolean not null default false,
  -- VIP: sürücü bu ilanda yalnızca tek bir yolcu/rezervasyon kabul etmek
  -- istiyor (yabancılarla paylaşımlı değil). seat_count=1 zorunluluğu, Zod
  -- tarafındaki aynı kuralın (schemas.ts) veritabanı seviyesinde savunma-
  -- derinliği yedeği.
  add column vip_solo boolean not null default false,
  add constraint rides_vip_solo_single_seat check (not vip_solo or seat_count = 1);

-- update_own_profile'a car_brand/car_model eklenir. Parametre listesi
-- değiştiği için (0017'deki gibi) önce eski imza düşürülüp yeni bir overload
-- oluşturulur.
drop function public.update_own_profile(text, text, text, text, text, text, text);

create function public.update_own_profile(
  p_full_name text,
  p_bio text,
  p_language text,
  p_avatar_url text,
  p_phone text,
  p_iban text,
  p_iban_holder_name text,
  p_car_brand text,
  p_car_model text
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
        car_model = p_car_model
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
