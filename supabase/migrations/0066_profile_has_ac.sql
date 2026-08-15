-- Araç konforu filtresi: basit başlangıç, tek boolean (klima var/yok).
-- car_brand/car_model/car_plate ile aynı gerekçe (0018/0050) — hassas veri
-- değil, herkese açık (profiles, profiles_private değil).
alter table public.profiles
  add column has_ac boolean not null default false;

-- update_own_profile'a has_ac eklenir. Parametre listesi değiştiği için
-- (0018/0050'deki gibi) önce eski imza düşürülüp yeni bir overload
-- oluşturulur. Gövde 0050_car_plate.sql'deki son hâlinden birebir
-- kopyalanıp yalnızca has_ac eklendi (0052 sonrasında fonksiyonun kendisi
-- tekrar redefine edilmemiş, sadece profiles.language CHECK constraint'i
-- düşürülmüş — imza/gövde hâlâ 0050'deki).
drop function public.update_own_profile(text, text, text, text, text, text, text, text, text, text);

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
  p_has_ac boolean
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
        has_ac = p_has_ac
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
