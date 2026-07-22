-- Production blocker fix: `profiles` tablosundaki "select all profiles"
-- politikası (`using (true)`, `to` clause yok) anon dahil herkesin telefon
-- numarasını (phone, phone_verified) okuyabilmesine izin veriyordu, çünkü RLS
-- satır bazlıdır — aynı politika altında bir satır görünürse tüm kolonları
-- görünür.
--
-- Uygulama, rides/bookings/chat/reviews üzerinden başka kullanıcıların
-- profiles satırlarını yalnızca full_name + avatar_url (+ ride detay
-- sayfasında bio) için embed ediyor (bkz. features/rides/queries.ts,
-- features/bookings/queries.ts, features/chat/queries.ts) — phone hiçbir
-- yerde public olarak okunmuyor. Bu yüzden `profiles` üzerindeki genel
-- SELECT politikasını kısıtlamak (örn. sahibiyle sınırlamak) bu embed'leri
-- kırar. Bunun yerine phone/phone_verified'ı kendi RLS'i olan ayrı, sahibiyle
-- sınırlı bir tabloya taşıyoruz; `profiles` üzerindeki public SELECT
-- değişmeden kalır (kalan kolonların hiçbiri hassas değil).

create table public.profiles_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  phone text check (char_length(phone) <= 20),
  phone_verified boolean not null default false
);

insert into public.profiles_private (id, phone, phone_verified)
select id, phone, phone_verified from public.profiles;

alter table public.profiles drop column phone;
alter table public.profiles drop column phone_verified;

alter table public.profiles_private enable row level security;

-- Yalnızca sahibi kendi telefon numarasını okuyabilir/yazabilir; başka
-- kimse (anon dahil) için hiçbir SELECT politikası yok, yani hiçbir satır
-- görünmez.
create policy "select own phone" on public.profiles_private
  for select using (auth.uid() = id);

create policy "insert own phone" on public.profiles_private
  for insert to authenticated
  with check (auth.uid() = id);

create policy "update own phone" on public.profiles_private
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
