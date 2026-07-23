-- Faz 8: SMS/OTP tabanlı telefon doğrulama. Gerçek doğrulama Supabase
-- Auth'un kendi telefon değişikliği akışı üzerinden yapılır
-- (`supabase.auth.updateUser({ phone })` + `verifyOtp({ type: 'phone_change' })`,
-- bkz. src/features/profile/actions.ts) — bu, gerçek bir SMS sağlayıcısının
-- (Twilio/MessageBird/Vonage) Supabase projesinde yapılandırılmasını
-- gerektirir (bkz. supabase/config.toml → [auth.sms.twilio]), bu migration
-- yalnızca doğrulama SONUCUNU uygulamanın kendi tablosuna senkronize eder.
--
-- Tek doğruluk kaynağı auth.users.phone_confirmed_at'tir: bu sütun dolduğunda
-- (yani Supabase Auth OTP doğrulamasını onayladığında) profiles_private
-- otomatik güncellenir. Uygulama kodu phone_verified'ı asla doğrudan true
-- yazmaz.
create function public.sync_verified_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone_confirmed_at is not null then
    insert into public.profiles_private (id, phone, phone_verified)
    values (new.id, new.phone, true)
    on conflict (id) do update set phone = excluded.phone, phone_verified = true;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_phone_confirmed
  after update of phone_confirmed_at on auth.users
  for each row
  when (new.phone_confirmed_at is distinct from old.phone_confirmed_at)
  execute procedure public.sync_verified_phone();

-- Profil formundan telefon numarası elle değiştirildiğinde (doğrulama
-- akışının dışında) `phone_verified` artık otomatik true kalmıyor — yeni
-- numara auth.users üzerinde henüz doğrulanmadığı için eskisinin
-- doğrulanmış sayılması yanıltıcı olurdu. Numara değişmediyse (örn. kullanıcı
-- formun başka bir alanını güncelledi) mevcut doğrulama durumu korunur.
create or replace function public.update_own_profile(
  p_full_name text,
  p_bio text,
  p_language text,
  p_avatar_url text,
  p_phone text
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
        avatar_url = coalesce(p_avatar_url, avatar_url)
    where id = auth.uid();

  insert into public.profiles_private (id, phone, phone_verified)
  values (auth.uid(), p_phone, false)
  on conflict (id) do update
    set phone = excluded.phone,
        phone_verified = case
          when profiles_private.phone is distinct from excluded.phone then false
          else profiles_private.phone_verified
        end;
end;
$$;
