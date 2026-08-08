-- Faz 2A — yolcu ilanları (ters rezervasyon) backend temeli. Tasarım:
-- docs/plans/2026-08-08-passenger-listings-and-payment-protection-design.md
-- "Faz 2" bölümü.
--
-- driver_id'nin iki farklı işi ("ilan sahibi" ve "bu yolculuğun onaylanmış
-- sürücüsü") ayrıştırılıyor. posted_by = ilan sahibi (sürücü ilanında
-- driver_id ile aynı değer, yolcu ilanında ilanı açan yolcu). driver_id
-- anlamını KORUYOR — hâlâ "onaylanmış sürücü", sadece artık onay anına kadar
-- NULL olabiliyor.

create type public.ride_posted_by_role as enum ('driver', 'passenger');

alter table public.rides add column posted_by_role public.ride_posted_by_role not null default 'driver';
alter table public.rides add column posted_by uuid references public.profiles (id) on delete cascade;

-- Geriye dönük dolgu: var olan tüm ilanlar sürücü ilanı, posted_by = driver_id.
update public.rides set posted_by = driver_id where posted_by is null;

alter table public.rides alter column posted_by set not null;
alter table public.rides alter column driver_id drop not null;

create index rides_posted_by_idx on public.rides (posted_by);

-- Yolcu ilanında bookings satırı bir sürücünün teklifini temsil edebilir —
-- rides.driver_id onay anına kadar NULL olduğundan, aynı ilana birden fazla
-- sürücünün eşzamanlı teklifi olduğunda hangi teklifin hangi sürücüye ait
-- olduğunu ayırt edecek başka bir alan yok. driver_id sadece booker_role =
-- 'driver' satırlarında dolu; normal (booker_role = 'passenger') rezervasyon
-- taleplerinde her zaman NULL kalır (sürücü zaten rides.driver_id'den belli).
create type public.booking_booker_role as enum ('passenger', 'driver');

alter table public.bookings add column booker_role public.booking_booker_role not null default 'passenger';
alter table public.bookings add column driver_id uuid references public.profiles (id) on delete cascade;

alter table public.bookings add constraint bookings_driver_id_matches_booker_role
  check (
    (booker_role = 'driver' and driver_id is not null)
    or (booker_role = 'passenger' and driver_id is null)
  );

create index bookings_driver_id_idx on public.bookings (driver_id);
