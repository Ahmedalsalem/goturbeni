-- Kullanıcı talebi: referral sistemi. Ayrı bir "referral_code" kolonu/
-- fonksiyonu gerekmiyor — her profilin zaten benzersiz olan `id` (uuid)
-- alanının ilk 8 karakteri kod olarak kullanılıyor (app katmanında,
-- src/features/referrals/*), böylece kod üretimi/çakışma kontrolü hiç
-- gerekmiyor. Burada yalnızca "kim kimi davet etti" bilgisini tutan
-- referred_by eklenmesi ve handle_new_user'ın (0078_google_oauth_signup.sql)
-- kayıt sırasında bunu doldurabilmesi gerekiyor.
alter table public.profiles
  add column referred_by uuid references public.profiles(id) on delete set null;

-- handle_new_user: raw_user_meta_data'daki 'ref' alanı (signUp()'ın
-- options.data.ref'i, features/auth/actions.ts) varsa ve gerçekten var olan
-- bir profilin id'sinin ilk 8 karakterine eşleşiyorsa referred_by'ı doldurur.
-- Kendi kendine referans (id'nin ilk 8 karakteri kendi ref'i olamaz) ve
-- geçersiz/bulunamayan kodlar sessizce yok sayılır — referral hiçbir zaman
-- kaydı engelleyen zorunlu bir alan değil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_google boolean := (new.raw_app_meta_data->>'provider' = 'google');
  v_ref_code text := new.raw_user_meta_data->>'ref';
  v_referrer_id uuid;
begin
  if v_ref_code is not null then
    select id into v_referrer_id
    from public.profiles
    where left(id::text, 8) = lower(v_ref_code)
    limit 1;
  end if;

  insert into public.profiles (id, full_name, avatar_url, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    v_referrer_id
  );

  insert into public.profiles_private (id, email_verified)
  values (new.id, v_is_google);

  return new;
end;
$$;
