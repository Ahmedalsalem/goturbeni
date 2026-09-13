-- Kullanıcı talebi: admin panelde "kullanıcı nereden geldi" metriği.
-- signup_source, kaydın ilk dokunuşunu (utm_source, yoksa dış referrer
-- host'u, yoksa 'direct') tutar — middleware.ts'in ilk istekte yazdığı
-- gb_src cookie'sinden geliyor. Aynı ref/handle_new_user kalıbı
-- (0080_referrals.sql): e-posta/şifre kaydında raw_user_meta_data üzerinden,
-- Google OAuth'ta ise callback route'un exchangeCodeForSession sonrası ayrı
-- bir update'iyle dolduruluyor (Google'ın kendi profil verisinde bizim
-- source bilgimiz yok).
alter table public.profiles
  add column signup_source text check (char_length(signup_source) <= 100);

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

  insert into public.profiles (id, full_name, avatar_url, referred_by, signup_source)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    v_referrer_id,
    new.raw_user_meta_data->>'signup_source'
  );

  insert into public.profiles_private (id, email_verified)
  values (new.id, v_is_google);

  return new;
end;
$$;
