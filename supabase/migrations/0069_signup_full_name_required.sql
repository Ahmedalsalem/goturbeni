-- Kayıt formunda ad soyad alanı yoktu (features/admin/queries.ts üzerinden
-- fark edildi: profiles.full_name null olduğu için admin panelde birçok
-- kullanıcı "Kullanıcı" olarak görünüyordu). complete_registration_details
-- (0017_booking_payment_flow.sql) artık p_full_name alıyor ve profiles
-- satırını da güncelliyor — security invoker olduğundan mevcut
-- "update own profile" RLS politikası (auth.uid() = id) zaten bu yazmaya
-- izin veriyor. Parametre imzası değiştiği için "create or replace" eski
-- 2 parametreli sürümün üstüne yazmaz (ayrı bir overload olarak kalır) —
-- önce onu düşürüyoruz.
drop function public.complete_registration_details(text, text);

create function public.complete_registration_details(p_gender text, p_phone text, p_full_name text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.profiles_private (id, gender, phone, phone_verified)
  values (auth.uid(), p_gender::public.profile_gender, p_phone, false)
  on conflict (id) do update
    set gender = excluded.gender,
        phone = excluded.phone,
        phone_verified = false;

  update public.profiles
  set full_name = p_full_name
  where id = auth.uid();
end;
$$;
