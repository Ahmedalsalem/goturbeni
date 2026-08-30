-- Google ile giriş desteği: handle_new_user (0001_profiles.sql) artık yeni
-- auth.users satırının Google'dan taşıdığı ad-soyad/profil fotoğrafını
-- (raw_user_meta_data) profiles'a otomatik yazıyor — parola ile kayıt
-- olanlarda bu alanlar boş geldiğinden (coalesce hepsi null döner) davranış
-- değişmiyor, full_name yine complete_registration_details/signUp() akışıyla
-- sonradan doldurulur.
--
-- Ayrıca artık profiles_private satırını da baştan oluşturuyor (öncesinde bu
-- yalnızca complete_registration_details/update_own_profile ilk çağrıldığında
-- oluşuyordu) — provider Google ise email_verified baştan true: Google zaten
-- e-posta sahipliğini doğrulamış sayılır, kendi 6 haneli kodumuzu tekrar
-- istemenin bir anlamı yok. Diğer sağlayıcılarda (parola) false kalır,
-- mevcut e-posta kodu akışı (0035_email_based_verification.sql) değişmeden
-- sürer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_google boolean := (new.raw_app_meta_data->>'provider' = 'google');
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );

  insert into public.profiles_private (id, email_verified)
  values (new.id, v_is_google);

  return new;
end;
$$;
