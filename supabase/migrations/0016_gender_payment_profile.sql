-- Zorunlu cinsiyet beyanı + sürücü ödeme bilgisi (IBAN) + "yalnızca kadın
-- yolcu" ilan filtresi. Cinsiyet kendi beyanına dayalıdır (kimlik doğrulamalı
-- değildir) — "yalnızca kadın" filtresi bunun üzerine kurulu bir
-- güvenlik/konfor özelliğidir, gerçek kimlik doğrulaması kapsam dışıdır.
--
-- Cinsiyet ve IBAN, phone ile aynı gerekçeyle (bkz. 0006_profiles_phone_privacy.sql)
-- profiles_private'a eklenir: cinsiyetin herkese açık olması gerekmez (yalnızca
-- "kendi" cinsiyetini bilen bir kullanıcının kendi görünürlüğünü belirlemesi
-- yeterlidir, bkz. aşağıdaki rides RLS), IBAN zaten hassas bir finansal veridir.
-- 0006'daki "select/insert/update own phone" politikaları tabloya, sütuna
-- değil, satıra bağlı olduğundan yeni sütunlar için ek bir RLS politikası
-- gerekmez.

create type public.profile_gender as enum ('female', 'male');

alter table public.profiles_private
  add column gender public.profile_gender,
  add column iban text check (char_length(iban) <= 34),
  add column iban_holder_name text check (char_length(iban_holder_name) <= 100);

alter table public.rides
  add column women_only boolean not null default false;

-- Erkek/misafir kullanıcılar için "yalnızca kadın yolcu" ilanlarını sorgu
-- seviyesinde görünmez yapar: src/features/rides/queries.ts ve
-- src/app/rides/[id]/page.tsx zaten RLS'e tabi request-scoped client
-- kullanıyor, bu politika değişikliği tek başına yeterlidir (uygulama
-- katmanında ekstra bir filtre gerekmez).
drop policy "select all rides" on public.rides;

create policy "select all rides" on public.rides
  for select using (
    not women_only
    or driver_id = auth.uid()
    or exists (
      select 1 from public.profiles_private
      where profiles_private.id = auth.uid() and profiles_private.gender = 'female'
    )
  );
