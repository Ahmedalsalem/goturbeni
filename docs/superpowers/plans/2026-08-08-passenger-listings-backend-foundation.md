# Yolcu İlanları — Faz 2A: Backend Temeli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `rides`/`bookings` şemasını, RLS'i ve `approve_booking`/`reject_booking` RPC'lerini yolcuların da ilan açıp sürücülerin teklif verebileceği şekilde genişlet — sürücü tarafında hiçbir kullanıcı-görünür davranış değişmeden (RideForm hâlâ sadece sürücü ilanı üretir, bu planın parçası değil).

**Architecture:** `rides`'a `posted_by_role`/`posted_by` eklenir, `driver_id` nullable olur (onay anına kadar); `bookings`'e `booker_role`/`driver_id` eklenir (hangi teklifin hangi sürücüye ait olduğunu ayırt etmek için). `approve_booking`/`reject_booking` rol-farkında yetkilendirmeye geçer; onay anında `_apply_booking_approval` gerekirse `rides.driver_id`'yi teklif veren sürücüye atar. `createRide`/`updateRide`/`cancelRide`/`getMyRides` "ilan sahibi" kontrolünü `driver_id`'den `posted_by`'a taşır (sürücü ilanlarında `posted_by = driver_id` olduğundan davranış aynı kalır).

**Tech Stack:** Next.js 15 (Server Actions) + Supabase (Postgres, RLS, `security definer` RPC) + Vitest.

## Global Constraints

- Son migration `0056`; yeni dosyalar `0057`, `0058`, `0059`.
- Bu şema/RLS değişikliğinin, mevcut sürücü-ilanı akışında (RideForm hâlâ her zaman `posted_by_role: 'driver'`, `posted_by: user.id`, `driver_id: user.id` gönderir) **sıfır davranış değişikliği** yaratmaması zorunlu — her migration'da bu, var olan davranışın matematiksel olarak eşdeğer kaldığı gösterilerek doğrulanmalı (`posted_by = driver_id` olduğunda eski/yeni RLS/RPC mantığı aynı sonucu vermeli).
- Bu ortamda gerçek/bağlı bir Supabase projesi yok — migration'lar deploy edilemez. Doğrulama: SQL'in var olan fonksiyonlarla aynı desende olduğu, `npm run lint`/`npx tsc --noEmit`/`npm test`.
- Bu planın kapsamı **sadece backend temeli**. Kapsam dışı (ayrı bir plana bırakıldı, kodda hiçbir iz bırakılmayacak TODO değil, sadece yapılmayacak):
  - RideForm'da "Yolcuyum" rol seçimi, RideCard/RideFilters ilan tipi ayrımı, `/rides/mine` yolcu ilanı sekmesi, i18n, e2e — **Faz 2B**.
  - `submit_deposit_receipt_ocr`/`submit_settlement_receipt_ocr`'ın yolcu-ilanı akışı için otomatik onay desteği — şu anki hâliyle, `v_ride.driver_id` onay öncesi `NULL` olduğundan IBAN eşleşmesi hiç bulunamayıp **güvenli şekilde manuel onaya düşer** (davranış: otomatik onay çalışmaz, hata da vermez) — bu planın kapsamında sadece `_apply_booking_approval`'ın yeni imzasına uyacak şekilde tek bir çağrı satırı güncelleniyor (Task 3), otomatik onay mantığının kendisi genişletilmiyor.
  - Sürücünün yolcu ilanına verdiği bekleyen teklifi geri çekmesi (`cancel_booking`, şu an sadece `passenger_id` kontrolü yapıyor, teklif veren sürücüyü kapsamıyor) — deferred.

---

### Task 1: Migration 0057 — şema (rides.posted_by_role/posted_by, bookings.booker_role/driver_id)

**Files:**
- Create: `supabase/migrations/0057_passenger_listings_schema.sql`

**Interfaces:**
- Produces: `public.ride_posted_by_role` enum (`'driver'|'passenger'`), `rides.posted_by_role` (not null, default `'driver'`), `rides.posted_by` (uuid, not null, references `profiles`), `rides.driver_id` artık nullable. `public.booking_booker_role` enum (`'passenger'|'driver'`), `bookings.booker_role` (not null, default `'passenger'`), `bookings.driver_id` (uuid, nullable, references `profiles`) + check constraint `bookings_driver_id_matches_booker_role`.

- [ ] **Step 1: Migration dosyasını yaz**

```sql
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
```

- [ ] **Step 2: Yeni migration'ın var olan desenlerle tutarlı olduğunu gözden geçir**

`supabase/migrations/0002_rides.sql` ve `0003_bookings.sql`'deki enum/kolon/index tanımlarıyla stil karşılaştırması yap (Türkçe yorum üslubu, `not null references ... on delete cascade` deseni, index isimlendirmesi `<table>_<column>_idx`).

- [ ] **Step 3: `npm run lint` ve `npx tsc --noEmit` çalıştır**

Bu saf bir SQL dosyası, TS tarafını etkilememeli — ikisinin de temiz çıktığını doğrula.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0057_passenger_listings_schema.sql
git commit -m "$(cat <<'EOF'
rides.posted_by/posted_by_role ve bookings.booker_role/driver_id ekle

Faz 2A — yolcu ilanları backend temeli. posted_by "ilan sahibi"
anlamına geliyor (driver_id "onaylanmış sürücü" anlamını koruyor,
sadece artık onay anına kadar NULL olabiliyor). bookings.driver_id,
bir yolcu ilanına aynı anda birden fazla sürücünün teklif verebilmesi
için hangi teklifin kime ait olduğunu ayırt ediyor.
EOF
)"
```

---

### Task 2: Migration 0058 — RLS politikaları

**Files:**
- Create: `supabase/migrations/0058_passenger_listings_rls.sql`

**Interfaces:**
- Consumes: Task 1'in `posted_by`/`posted_by_role`/`booker_role`/`driver_id` kolonları.
- Produces: `rides`'ın `insert own ride`/`update own ride` politikalarının, `bookings`'in `insert own booking`/`select own or driver bookings` politikalarının yeni (rol-farkında) versiyonları.

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Faz 2A — RLS politikalarını posted_by/booker_role'e göre genişlet.
--
-- rides: "insert own ride" — 0014_admin.sql'deki (suspension eklenmiş) son
-- hâlini rol-farkında yapıyoruz. Sürücü ilanında eski davranış birebir
-- korunuyor (auth.uid() = posted_by = driver_id). Yolcu ilanında driver_id
-- NULL olmalı, posted_by ilanı açan yolcu olmalı.
drop policy "insert own ride" on public.rides;
create policy "insert own ride" on public.rides
  for insert to authenticated
  with check (
    (
      (posted_by_role = 'driver' and auth.uid() = posted_by and auth.uid() = driver_id)
      or (posted_by_role = 'passenger' and auth.uid() = posted_by and driver_id is null)
    )
    and not public.is_suspended()
  );

-- rides: "update own ride" — 0002_rides.sql'den beri hiç değişmemişti,
-- driver_id yerine posted_by kullanacak şekilde değiştiriliyor. Sürücü
-- ilanında posted_by = driver_id olduğundan davranış aynı.
drop policy "update own ride" on public.rides;
create policy "update own ride" on public.rides
  for update to authenticated
  using (auth.uid() = posted_by and status = 'active')
  with check (auth.uid() = posted_by);

-- bookings: "insert own booking" — 0014_admin.sql'deki son hâlini
-- rol-farkında yapıyoruz. booker_role = 'passenger' (normal rezervasyon
-- talebi) davranışı birebir korunuyor. booker_role = 'driver' (bir yolcu
-- ilanına teklif) satırında auth.uid() teklif veren sürücü olmalı
-- (driver_id), passenger_id ilan sahibi yolcu olmalı — bu ikinci eşitlik
-- burada DENETLENMİYOR (RLS insert policy'si sadece auth.uid()'in
-- doğrulanabilir bir alanla eşleştiğini garanti eder; passenger_id'nin
-- gerçekten o ilanın sahibi olduğu app katmanında/approve_booking'de
-- doğrulanır — bookings tablosunun kendisi "hangi ride_id" ile "hangi
-- passenger_id" arasında bir kısıt taşımıyor, tıpkı bugünkü normal
-- rezervasyon taleplerinde de olduğu gibi).
drop policy "insert own booking" on public.bookings;
create policy "insert own booking" on public.bookings
  for insert to authenticated
  with check (
    (
      (booker_role = 'passenger' and auth.uid() = passenger_id)
      or (booker_role = 'driver' and auth.uid() = driver_id)
    )
    and not public.is_suspended()
  );

-- bookings: "select own or driver bookings" — 0022_admin_bookings_select.sql'deki
-- son hâlini genişletiyoruz. rides.driver_id yerine rides.posted_by
-- kullanmak sürücü ilanlarında davranışı değiştirmiyor (posted_by =
-- driver_id) ve yolcu ilanlarında "ilan sahibi kendi ilanına gelen
-- teklifleri görür" davranışını ekliyor. Ayrıca teklif veren sürücünün
-- KENDİ teklifini (booker_role='driver' satırında auth.uid() = driver_id)
-- görebilmesi ekleniyor.
drop policy "select own or driver bookings" on public.bookings;
create policy "select own or driver bookings" on public.bookings
  for select using (
    auth.uid() = passenger_id
    or auth.uid() = bookings.driver_id
    or exists (select 1 from public.rides where rides.id = bookings.ride_id and rides.posted_by = auth.uid())
    or public.is_admin()
  );
```

- [ ] **Step 2: Her politikanın sürücü-ilanı durumunda eski davranışla eşdeğer olduğunu masaüstünde doğrula**

Dört politikanın her biri için: `posted_by_role = 'driver'` ve `booker_role = 'passenger'` (bugünkü tek durum) değerlerini yerine koyup, ifadenin eski (0014/0002/0022) politikayla mantıksal olarak aynı sonucu verdiğini teyit et. Bunu Task raporuna yaz (hangi politika, hangi ikame, hangi sonuç).

- [ ] **Step 3: `npm run lint` ve `npx tsc --noEmit` çalıştır**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0058_passenger_listings_rls.sql
git commit -m "$(cat <<'EOF'
rides/bookings RLS politikalarını posted_by/booker_role'e göre genişlet

insert own ride, update own ride, insert own booking, select own or
driver bookings — dördü de rol-farkında hale getirildi. Sürücü ilanı
akışında (posted_by=driver_id, booker_role=passenger) davranış
matematiksel olarak aynı kalıyor.
EOF
)"
```

---

### Task 3: Migration 0059 — approve_booking/reject_booking rol-farkında yetkilendirme

**Files:**
- Create: `supabase/migrations/0059_passenger_listings_approve_reject.sql`

**Interfaces:**
- Consumes: Task 1/2'nin kolonları ve politikaları.
- Produces: `_apply_booking_approval(uuid, uuid, integer, uuid default null)` (imza değişti — eski 3-parametreli sürüm `drop function` ile kaldırılıyor), `approve_booking(uuid)` (imza aynı, gövde rol-farkında), `reject_booking(uuid)` (imza aynı, gövde rol-farkında), `submit_deposit_receipt_ocr`'ın tek bir çağrı satırı güncellendi (4. parametre `null`, davranış değişmedi — bkz. Global Constraints'teki kapsam-dışı notu).

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Faz 2A — approve_booking/reject_booking'i rol-farkında yap: sürücü ilanında
-- (posted_by_role='driver') eski davranış (sadece rides.driver_id onaylar/
-- reddeder) birebir korunuyor; yolcu ilanında (posted_by_role='passenger')
-- ilan sahibi (rides.posted_by) teklifleri onaylar/reddeder, onay anında
-- teklif veren sürücü (bookings.driver_id) rides.driver_id'ye atanır.
--
-- _apply_booking_approval'ın imzası değişiyor (yeni bir opsiyonel parametre)
-- — Postgres'te CREATE OR REPLACE parametre listesini değiştiremiyor (farklı
-- imza = farklı fonksiyon/overload), bu yüzden eski 3-parametreli sürüm
-- açıkça DROP ediliyor.
drop function public._apply_booking_approval(uuid, uuid, integer);

create function public._apply_booking_approval(
  p_booking_id uuid,
  p_ride_id uuid,
  p_seat_count integer,
  p_assign_driver_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rides
    set available_seats = available_seats - p_seat_count,
        status = case when available_seats - p_seat_count = 0 then 'full' else status end,
        driver_id = coalesce(p_assign_driver_id, driver_id)
    where id = p_ride_id;

  update public.bookings
    set status = 'approved', payment_status = 'deposit_confirmed'
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;

revoke all on function public._apply_booking_approval(uuid, uuid, integer, uuid) from public, anon, authenticated;

create or replace function public.approve_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'booking_not_pending';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id for update;

  if v_ride.posted_by_role = 'driver' then
    if v_ride.driver_id <> auth.uid() then
      raise exception 'not_ride_driver';
    end if;
  else
    if v_ride.posted_by <> auth.uid() then
      raise exception 'not_ride_owner';
    end if;
    if v_booking.driver_id is null then
      raise exception 'not_driver_offer';
    end if;
  end if;

  if v_ride.available_seats < v_booking.seat_count then
    raise exception 'not_enough_seats';
  end if;

  perform public._apply_booking_approval(
    p_booking_id,
    v_ride.id,
    v_booking.seat_count,
    case when v_ride.posted_by_role = 'passenger' then v_booking.driver_id else null end
  );
end;
$$;

create or replace function public.reject_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'booking_not_pending';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;

  if v_ride.posted_by_role = 'driver' then
    if v_ride.driver_id <> auth.uid() then
      raise exception 'not_ride_driver';
    end if;
  else
    if v_ride.posted_by <> auth.uid() then
      raise exception 'not_ride_owner';
    end if;
  end if;

  update public.bookings set status = 'rejected' where id = p_booking_id;
end;
$$;

-- submit_deposit_receipt_ocr: tek değişiklik, _apply_booking_approval'ın
-- yeni 4-parametreli imzasına uyum (4. parametre null — bu fonksiyon
-- otomatik onayı sadece booker_role='passenger' (normal) rezervasyonlar
-- için tetikler; yolcu ilanına verilen sürücü tekliflerinde v_ride.driver_id
-- onay öncesi zaten NULL olduğundan aşağıdaki IBAN eşleşmesi hiçbir zaman
-- bulunamaz ve fonksiyon zaten `return false` ile güvenli şekilde manuel
-- onaya düşer — bu davranış bilerek değiştirilmedi, bkz. plan Global
-- Constraints). Gövdenin geri kalanı 0053_deposit_ocr_auto_approval.sql'deki
-- ile birebir aynı.
create or replace function public.submit_deposit_receipt_ocr(p_booking_id uuid, p_iban text, p_amounts numeric[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
  v_passenger public.profiles;
  v_driver_iban text;
  v_expected_amount numeric(10, 2);
  v_ocr_iban text := upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g'));
  v_low_risk boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.passenger_id <> auth.uid() then
    raise exception 'not_authorized';
  end if;

  update public.bookings
    set deposit_ocr_iban = nullif(v_ocr_iban, ''),
        deposit_ocr_amounts = p_amounts,
        deposit_ocr_checked_at = now()
    where id = p_booking_id;

  if v_booking.status <> 'pending' then
    return false;
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id for update;
  select iban into v_driver_iban from public.profiles_private where id = v_ride.driver_id;
  if v_driver_iban is null or v_ocr_iban = '' or v_driver_iban <> v_ocr_iban then
    return false;
  end if;

  v_expected_amount := round(v_ride.cost_share * v_booking.seat_count * 0.25, 2);
  if not exists (select 1 from unnest(p_amounts) as amt where abs(amt - v_expected_amount) <= 5.00) then
    return false;
  end if;

  select * into v_passenger from public.profiles where id = v_booking.passenger_id;
  v_low_risk := (
    extract(epoch from (now() - v_passenger.created_at)) / 86400 >= 14
    and not public.is_suspended(v_booking.passenger_id)
    and v_booking.deposit_receipt_reject_count = 0
    and not exists (select 1 from public.get_suspicious_accounts_internal() s where s.user_id = v_booking.passenger_id)
    and not exists (
      select 1 from public.disputes d
      where d.status in ('open', 'in_review')
        and (d.opened_by = v_booking.passenger_id or d.against_user_id = v_booking.passenger_id)
    )
  );
  if not v_low_risk then
    return false;
  end if;

  if v_ride.available_seats < v_booking.seat_count then
    return false;
  end if;

  perform public._apply_booking_approval(p_booking_id, v_ride.id, v_booking.seat_count, null);

  update public.bookings
    set deposit_receipt_status = 'approved',
        deposit_receipt_reviewed_at = now()
    where id = p_booking_id;

  return true;
end;
$$;
```

**Önemli:** `0.25` değeri Task 2'nin (bu değil, önceki Faz 1 branch'inin) Faz 1 çalışmasından geliyor — mevcut repoda zaten `0.25` olarak duruyor olmalı (`submit_deposit_receipt_ocr`'ın gerçek güncel gövdesini `supabase/migrations/0056_no_show_tightening_and_deposit_ratio.sql`'den okuyup birebir kopyala, buradaki `0.25` sadece referans amaçlı — gerçek değeri repodan doğrula).

- [ ] **Step 2: Gerçek repodaki `submit_deposit_receipt_ocr` gövdesini doğrula**

`supabase/migrations/0056_no_show_tightening_and_deposit_ratio.sql`'i aç, içindeki `submit_deposit_receipt_ocr` fonksiyonunu bul, yukarıdaki adımda yazdığın gövdenin (tek satır dışında — `_apply_booking_approval` çağrısı) BİREBİR aynı olduğunu satır satır karşılaştır. Fark varsa, gerçek repo halini esas al, bu adımdaki metni düzelt.

- [ ] **Step 3: Var olan çağrı yerlerini kontrol et**

`grep -rn "_apply_booking_approval" supabase/migrations/*.sql src/` — bu migration dışında hiçbir dosyada 3-parametreli eski çağrı kalmamalı (yalnızca bu yeni migration'daki 3 çağrı: `approve_booking` içinde, `submit_deposit_receipt_ocr` içinde — ikisi de artık 4 parametreli).

- [ ] **Step 4: `npm run lint` ve `npx tsc --noEmit` çalıştır**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0059_passenger_listings_approve_reject.sql
git commit -m "$(cat <<'EOF'
approve_booking/reject_booking'i rol-farkında yap

Sürücü ilanında davranış aynı. Yolcu ilanında ilan sahibi (posted_by)
teklifleri onaylar/reddeder; onay anında teklif veren sürücü
(bookings.driver_id) rides.driver_id'ye atanır. _apply_booking_approval
yeni bir opsiyonel parametre alıyor (eski imza drop edildi, Postgres
CREATE OR REPLACE ile parametre listesi değiştirilemediği için).
submit_deposit_receipt_ocr'ın tek çağrı satırı yeni imzaya uyarlandı,
davranışı değişmedi (yolcu ilanı tekliflerinde zaten IBAN eşleşmesi
bulunamayıp güvenli şekilde manuel onaya düşüyor).
EOF
)"
```

---

### Task 4: TypeScript tipleri — Ride/Booking

**Files:**
- Modify: `src/types/ride.ts`
- Modify: `src/types/booking.ts`

**Interfaces:**
- Produces: `RidePostedByRole`, `Ride.posted_by_role`, `Ride.posted_by`, `Ride.driver_id: string | null` (artık nullable), `BookingBookerRole`, `Booking.booker_role`, `Booking.driver_id: string | null`.

- [ ] **Step 1: `src/types/ride.ts`'i güncelle**

```ts
export type RideStatus = "active" | "full" | "completed" | "cancelled"
export type RidePostedByRole = "driver" | "passenger"

export interface Ride {
  id: string
  driver_id: string | null
  posted_by_role: RidePostedByRole
  posted_by: string
  departure_city: string
  arrival_city: string
  departure_district: string | null
  arrival_district: string | null
  departure_time: string
  seat_count: number
  available_seats: number
  cost_share: number
  description: string | null
  pets_allowed: boolean
  smoking_allowed: boolean
  vip_solo: boolean
  status: RideStatus
  series_id: string | null
  created_at: string
  updated_at: string
}

export interface RideWithDriver extends Ride {
  driver: {
    full_name: string | null
    avatar_url: string | null
    car_brand: string | null
    car_model: string | null
    car_plate: string | null
  } | null
}
```

(Tek değişiklik: `driver_id: string` → `driver_id: string | null`, ve iki yeni alan `posted_by_role`/`posted_by`. `RideWithDriver.driver` zaten nullable'dı, dokunmuyoruz.)

- [ ] **Step 2: `src/types/booking.ts`'i güncelle**

`Booking` interface'ine, `seat_count`'tan hemen sonra iki alan ekle:

```ts
export type BookingBookerRole = "passenger" | "driver"

export interface Booking {
  id: string
  ride_id: string
  passenger_id: string
  seat_count: number
  booker_role: BookingBookerRole
  driver_id: string | null
  status: BookingStatus
  payment_status: BookingPaymentStatus
  deposit_deadline_at: string
  driver_settled_at: string | null
  passenger_settled_at: string | null
  deposit_receipt_url: string | null
  deposit_receipt_status: ReceiptStatus | null
  deposit_receipt_reviewed_at: string | null
  deposit_receipt_reject_reason: string | null
  deposit_receipt_reject_count: number
  settlement_receipt_url: string | null
  settlement_receipt_status: ReceiptStatus | null
  settlement_receipt_reviewed_at: string | null
  settlement_receipt_reject_reason: string | null
  settlement_receipt_reject_count: number
  refund_status: RefundStatus
  refund_proof_url: string | null
  refund_requested_at: string | null
  refund_confirmed_at: string | null
  refund_reject_reason: string | null
  refund_reject_count: number
  cancelled_at: string | null
  passenger_no_show: boolean
  driver_no_show: boolean
  created_at: string
  updated_at: string
}
```

Dosyanın geri kalanı (`BookingStatus`, `BookingPaymentStatus`, `ReceiptStatus`, `RefundStatus`, `BookingWithRide`, `BookingWithPassenger`) değişmeden kalır.

- [ ] **Step 3: `npx tsc --noEmit` çalıştır**

`Ride.driver_id`'nin `string | null` olması, onu `string` bekleyen her yeri derleme hatasına düşürecek — bu BEKLENEN ve İSTENEN bir sonuç (Task 5/6 bu kullanım yerlerini düzeltecek). Bu adımda sadece hata listesini kaydet, düzeltme bu task'ın kapsamında değil.

- [ ] **Step 4: Commit**

```bash
git add src/types/ride.ts src/types/booking.ts
git commit -m "$(cat <<'EOF'
Ride/Booking tiplerine posted_by_role/posted_by/booker_role/driver_id ekle

Ride.driver_id artık nullable (0057). Bu commit'ten sonra tsc,
driver_id'yi string varsayan kullanım yerlerinde hata verir —
düzeltme sonraki task'larda.
EOF
)"
```

---

### Task 5: `rides/actions.ts` ve `rides/queries.ts` — posted_by'a geçiş

**Files:**
- Modify: `src/features/rides/actions.ts`
- Modify: `src/features/rides/queries.ts`

**Interfaces:**
- Consumes: Task 1-4'ün şema/tip değişiklikleri.
- Produces: `createRide` artık `posted_by_role: 'driver'`, `posted_by: user.id` de insert eder (driver_id zaten `user.id` idi, değişmedi). `updateRide`/`cancelRide` ilan-sahibi kontrolü `driver_id` yerine `posted_by`. `getMyRides`/`getMyActiveRideSeries` aynı şekilde.

- [ ] **Step 1: `buildRideRow`'a `posted_by_role`/`posted_by` ekle**

`src/features/rides/actions.ts` içindeki `buildRideRow` fonksiyonu artık `driver_id`'yi almıyor (çağıran zaten ayrıca ekliyor) — bu adım sadece `createRide`'ın insert satırını değiştiriyor, `buildRideRow`'un kendisi (updateRide'da da kullanılıyor, orada `driver_id`/`posted_by` hiç değişmemeli) dokunulmuyor. `createRide` içinde:

```ts
  const { data: ride, error } = await supabase
    .from("rides")
    .insert({ driver_id: user.id, posted_by_role: "driver", posted_by: user.id, ...buildRideRow(parsed.data) })
    .select("id")
    .single()
```

(Tek değişiklik: `posted_by_role: "driver", posted_by: user.id` eklendi, `driver_id: user.id` zaten vardı.)

- [ ] **Step 2: `updateRide`'ı `posted_by`'a geçir**

```ts
  const { error } = await supabase
    .from("rides")
    .update(buildRideRow(parsed.data))
    .eq("id", rideId)
    .eq("posted_by", user.id)
    .eq("status", "active")
```

(`.eq("driver_id", user.id)` → `.eq("posted_by", user.id)`.)

- [ ] **Step 3: `getMyRides`'ı `posted_by`'a geçir**

`src/features/rides/queries.ts` içinde:

```ts
export async function getMyRides(userId: string): Promise<RideWithDriver[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("rides")
    .select(RIDE_WITH_DRIVER_SELECT)
    .eq("posted_by", userId)
    .order("created_at", { ascending: false })

  return (data as RideWithDriver[] | null) ?? []
}
```

(Parametre adı `driverId` → `userId` — artık her zaman bir sürücü olmayabileceği için; `.eq("driver_id", ...)` → `.eq("posted_by", ...)`.)

- [ ] **Step 4: `getMyRides`'ın çağrı yerini güncelle**

`grep -rn "getMyRides(" src/` ile çağrı yerini bul (muhtemelen `src/app/rides/mine/page.tsx`) — parametre adı değişikliği (sadece TS tarafında iç isim) çağıran kodu etkilemez, ama fonksiyonun içine geçirilen değer hâlâ `user.id` olmalı, bunu doğrula.

- [ ] **Step 5: `getMyActiveRideSeries`'i değiştirme**

`ride_series` tablosu bu planın kapsamında DEĞİL (yolcu ilanları `repeatWeekly` desteklemiyor, Global Constraints) — `getMyActiveRideSeries(driverId)` aynı kalır, `driver_id` kullanmaya devam eder. Bu adımda hiçbir kod değişikliği yok, sadece bunu doğrulayıp Task raporuna "bilerek dokunulmadı" diye not düş.

- [ ] **Step 6: `getDriverCompletedRideCount`'a dokunma**

Aynı şekilde — bu fonksiyon "gerçekten sürücülük yaptı mı" sorusuna cevap veriyor, `driver_id` kullanmaya devam etmeli (onaylanmış sürücü anlamında, `posted_by` değil). Değiştirme.

- [ ] **Step 7: `npx tsc --noEmit` çalıştır, `Ride.driver_id` nullable olmasından kaynaklanan hataları kontrol et**

Task 4 Step 3'te kaydettiğin hata listesiyle karşılaştır — bu task'ın değiştirdiği dosyalarda kalan hata olmamalı. Başka dosyalarda (örn. `bookings/actions.ts`, `RideCard.tsx`) hâlâ hata olabilir — bunlar Task 6'nın (bookings/actions.ts) veya kapsam dışının (RideCard.tsx, Faz 2B) konusu, bu task'ta düzeltme.

- [ ] **Step 8: Commit**

```bash
git add src/features/rides/actions.ts src/features/rides/queries.ts
git commit -m "$(cat <<'EOF'
rides/actions.ts ve queries.ts'i posted_by'a geçir

createRide artık posted_by_role/posted_by de yazıyor. updateRide/
getMyRides ilan-sahibi kontrolü driver_id yerine posted_by kullanıyor
— sürücü ilanlarında posted_by=driver_id olduğundan davranış aynı.
getMyActiveRideSeries/getDriverCompletedRideCount bilerek dokunulmadı
(sırasıyla: kapsam dışı, hâlâ "onaylanmış sürücü" anlamı taşıyor).
EOF
)"
```

---

### Task 6: `bookings/actions.ts` — `approveBooking` yolcu-ilanı IBAN/plaka kontrolü + kalan tsc hataları

**Files:**
- Modify: `src/features/bookings/actions.ts`
- Modify: `src/features/bookings/queries.ts`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: `getRide` (`@/features/rides/queries`, artık `Ride.posted_by_role`/`driver_id: string | null` döndürüyor), `TR_PLATE_PATTERN` (`@/features/profile/schemas`).
- Produces: `getBookingDriverId(bookingId): Promise<string | null>` (yeni, `getBookingPassengerId`'nin aynısı deseninde). `approveBooking`, ilan `posted_by_role === "passenger"` ise RPC'yi çağırmadan önce teklif veren sürücünün (`booking.driver_id`) IBAN + plaka bilgisini kontrol eder — `createRide`'daki aynı kontrolün (Task 5'te dokunulmayan, `rides/actions.ts`'teki) bir kopyası, ama teklif veren sürücü için.

- [ ] **Step 1: `bookings/queries.ts`'e `getBookingDriverId` ekle**

`getBookingPassengerId`'nin hemen altına:

```ts
// approveBooking, bir yolcu ilanına verilen teklifi onaylarken teklif veren
// sürücünün IBAN/plaka bilgisini kontrol etmek için bu sürücünün id'sine
// ihtiyaç duyar (bookings.driver_id, sadece booker_role='driver' satırlarında
// dolu) — getBookingPassengerId ile aynı desen.
export async function getBookingDriverId(bookingId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("bookings").select("driver_id").eq("id", bookingId).single()
  return data?.driver_id ?? null
}
```

- [ ] **Step 2: `messages/tr.json`'a iki yeni hata anahtarı ekle**

`Bookings.errors` içine, `driverNoShow`'dan hemen sonra (bkz. mevcut dosyada o anahtarın konumu):

```json
      "offerDriverIbanRequired": "Bu teklifi kabul edemezsiniz — teklif veren sürücünün IBAN bilgisi eksik.",
      "offerDriverCarPlateRequired": "Bu teklifi kabul edemezsiniz — teklif veren sürücünün plaka bilgisi eksik veya geçersiz.",
```

- [ ] **Step 3: `messages/en.json`'a aynı iki anahtarı ekle**

Aynı konumda:

```json
      "offerDriverIbanRequired": "You can't accept this offer — the offering driver's IBAN is missing.",
      "offerDriverCarPlateRequired": "You can't accept this offer — the offering driver's license plate is missing or invalid.",
```

- [ ] **Step 4: `messages/ar.json`'a aynı iki anahtarı ekle**

Aynı konumda:

```json
      "offerDriverIbanRequired": "لا يمكنك قبول هذا العرض — بيانات IBAN الخاصة بالسائق المُقدِّم للعرض ناقصة.",
      "offerDriverCarPlateRequired": "لا يمكنك قبول هذا العرض — رقم لوحة السائق المُقدِّم للعرض ناقص أو غير صالح.",
```

- [ ] **Step 5: `approveBooking`'i güncelle**

`src/features/bookings/actions.ts` içindeki import listesine ekle:

```ts
import { getBookingDriverId, getBookingPassengerId } from "@/features/bookings/queries"
import { getRide } from "@/features/rides/queries"
import { TR_PLATE_PATTERN } from "@/features/profile/schemas"
```

(`getRide` zaten `bookings/actions.ts`'te import edilmiş olabilir — `createBooking` onu kullanıyor; import listesini tekrarlamadan mevcut satıra ekle. `getBookingPassengerId` zaten import edilmiş, yanına `getBookingDriverId` ekle. `TR_PLATE_PATTERN` yeni bir import.)

`approveBooking` fonksiyonunun gövdesini şu şekilde değiştir (RPC çağrısından ÖNCE yeni bir kontrol bloğu eklenir, geri kalan aynı kalır):

```ts
export async function approveBooking(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()

  // Yolcu ilanına verilen bir teklif onaylanıyorsa, teklif veren sürücünün
  // IBAN + plaka bilgisi burada kontrol edilir — sürücü ilanında bu kontrol
  // createRide'da (ilan açılırken) yapılıyordu; yolcu ilanında henüz bir
  // sürücü atanmadığından kontrol onay anına kayıyor (bkz. tasarım
  // dokümanı "Ödeme akışı sıralaması").
  const ride = await getRide(rideId)
  if (ride?.posted_by_role === "passenger") {
    const offeringDriverId = await getBookingDriverId(bookingId)
    if (offeringDriverId) {
      const supabase = await createClient()
      const { data: paymentInfo } = await supabase
        .from("profiles_private")
        .select("iban, iban_holder_name")
        .eq("id", offeringDriverId)
        .maybeSingle()
      if (!paymentInfo?.iban || !paymentInfo?.iban_holder_name) {
        return { error: tErrors("offerDriverIbanRequired") }
      }

      const { data: driverProfile } = await supabase.from("profiles").select("car_plate").eq("id", offeringDriverId).maybeSingle()
      if (!driverProfile?.car_plate || !TR_PLATE_PATTERN.test(driverProfile.car_plate)) {
        return { error: tErrors("offerDriverCarPlateRequired") }
      }
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("approve_booking", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.approveBooking")
    return { error: error.message.includes("not_enough_seats") ? tErrors("notEnoughSeats") : tErrors("approveFailed") }
  }

  const passengerId = await getBookingPassengerId(bookingId)
  if (passengerId) {
    await Promise.all([
      sendPushNotification({ type: "booking_approved", recipientId: passengerId, rideId }),
      sendEmailNotification({ type: "booking_approved", recipientId: passengerId, rideId }),
      recordNotificationEvent({ type: "booking_approved", recipientId: passengerId, rideId }),
    ])
  }

  revalidatePath(`/rides/${rideId}/bookings`)
  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}
```

(Dikkat: fonksiyonun ikinci `const supabase = await createClient()` çağrısı kasıtlı — ilk `supabase` değişkeni yalnızca `if (ride?.posted_by_role === "passenger")` bloğu içinde tanımlı/kapsamlı, RPC çağrısı için ayrı bir `supabase` gerekiyor. Bunu tek bir üst-kapsam değişkenine indirgeyip iki kez `createClient()` çağırmamak istersen, `const supabase = await createClient()` satırını fonksiyonun en başına, `await verifySession()`'dan hemen sonra taşı ve içerideki tekrar eden satırı sil — ikisi de doğru, hangisini seçersen seç, sadece bir kere `createClient()` çağıran temiz versiyonu tercih et.)

- [ ] **Step 6: `reject_booking` çağıran `rejectBooking` action'ına dokunma**

`reject_booking` RPC'si Task 3'te rol-farkında oldu ama ekstra bir ön-kontrol (IBAN/plaka) gerektirmiyor — reddetmek için ödeme bilgisi gerekmez. `rejectBooking` action'ı DEĞİŞMİYOR, bu adımda hiçbir kod yazma, sadece Task raporunda "bilerek dokunulmadı" diye belirt.

- [ ] **Step 7: `npx tsc --noEmit` çalıştır — Task 4 Step 3'teki hata listesiyle karşılaştır**

Bu task'ın değiştirdiği dosyalarda (`bookings/actions.ts`, `bookings/queries.ts`) sıfır hata kalmalı. Kapsam dışı UI dosyalarında (Faz 2B'nin konusu — `RideCard.tsx` vb.) hâlâ hata olabilir, bunlar bu plan kapsamında DEĞİL; kalan hata listesini Task 8'in (final doğrulama) raporuna aktar.

- [ ] **Step 8: Commit**

```bash
git add src/features/bookings/actions.ts src/features/bookings/queries.ts messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
approveBooking'e yolcu-ilanı teklifi için IBAN/plaka ön-kontrolü ekle

Sürücü ilanında bu kontrol createRide'da (ilan açılışında) yapılıyordu.
Yolcu ilanında henüz bir sürücü atanmadığından kontrol, teklifin ilan
sahibi tarafından onaylandığı ana kayıyor. rejectBooking'e dokunulmadı
(reddetmek ödeme bilgisi gerektirmiyor).
EOF
)"
```

---

### Task 7: Unit testler — regresyon + yeni davranış

**Files:**
- Modify: `src/features/rides/actions.test.ts` (dosya yoksa oluştur — kontrol et)
- Modify: `src/features/bookings/actions.test.ts`

**Interfaces:**
- Consumes: Task 5/6'nın değiştirdiği `createRide`, `updateRide`, `getMyRides`, `approveBooking`.

- [ ] **Step 1: `src/features/rides/actions.test.ts`'i oluştur (dosya henüz yok — doğrulandı: sadece `filters.test.ts` ve `schemas.test.ts` var)**

`src/features/bookings/actions.test.ts`'in en başındaki mock kurulumunu (dosyanın 1-44. satırları — `rpcMock`/`fromMock`/`createClientMock`/`verifySessionMock`/`revalidatePathMock`, `vi.mock` blokları) aynı desende kopyala, ek olarak `next/navigation`'ı da mock'la (`createRide`/`updateRide` başarı yolunda `redirect()` çağırıyor — Next.js'in gerçek `redirect()`'i bir framework-özel digest hatası fırlatır, test ortamında bunu güvenilir şekilde yakalamak yerine doğrudan mock'la):

```ts
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))
```

`checkRateLimit`, `getUserLocale`'ın da (bookings/actions.test.ts'te zaten mock'lanan `next-intl/server` deseni yeterli) mock'lanması gerekebilir — `rides/actions.ts`'in import listesini oku, `bookings/actions.test.ts`'te karşılığı olmayan her import için aynı desende bir `vi.mock` ekle.

- [ ] **Step 2: `createRide`'ın `posted_by_role`/`posted_by` insert ettiğini doğrulayan test yaz**

```ts
it("inserts posted_by_role and posted_by alongside driver_id", async () => {
  // ... mevcut createRide başarı testindeki mock kurulumunu tekrar et
  // (paymentInfo, driverProfile, insert mock) ...
  const insertMock = vi.fn().mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: "ride-1" }, error: null }) }),
  })
  fromMock.mockImplementation((table: string) => {
    if (table === "rides") return { insert: insertMock }
    if (table === "profiles_private") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { iban: "TR1", iban_holder_name: "Ad" } }) }) }) }
    if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { car_plate: "34 ABC 123" } }) }) }) }
    return {}
  })

  await createRide(VALID_RIDE_VALUES)

  expect(insertMock).toHaveBeenCalledWith(
    expect.objectContaining({ driver_id: FAKE_USER.id, posted_by_role: "driver", posted_by: FAKE_USER.id })
  )
})
```

`redirect` Step 1'de zaten `vi.fn()` olarak mock'landığı için burada `.catch()` gerekmiyor — çağrı sessizce no-op olur, `await` sorunsuz döner. `VALID_RIDE_VALUES` gibi bir sabit yoksa, `RideFormValues` şeklinde geçerli bir test objesi tanımla (bkz. `src/features/rides/schemas.test.ts`'teki geçerli örnek değerler — departureCity/arrivalCity farklı iki il, gelecekteki bir departureDate/departureTime, seatCount 1-8 arası, costShare ≥0).

- [ ] **Step 3: `updateRide`'ın `posted_by` ile filtrelediğini doğrulayan test yaz**

```ts
it("filters update by posted_by, not driver_id", async () => {
  const eqMock = vi.fn().mockReturnThis()
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
  eqMock.mockReturnValue({ eq: eqMock }) // zincirlenen üç .eq() çağrısı için
  fromMock.mockReturnValue({ update: updateMock })

  await updateRide("ride-1", VALID_RIDE_VALUES)

  expect(eqMock).toHaveBeenCalledWith("posted_by", FAKE_USER.id)
})
```

- [ ] **Step 4: Testleri çalıştır**

```bash
npx vitest run src/features/rides/actions.test.ts
```

Beklenen: yeni testler PASS.

- [ ] **Step 5: `bookings/actions.test.ts`'e `approveBooking`'in yolcu-ilanı kontrolü için testler ekle**

`approveBooking` describe bloğuna (mevcut testlerin yanına):

```ts
it("rejects approving an offer when the offering driver has no IBAN", async () => {
  getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", driver_id: null }))
  fromMock.mockImplementation((table: string) => {
    if (table === "bookings") return { select: () => ({ eq: () => ({ single: async () => ({ data: { driver_id: "offering-driver-1" } }) }) }) }
    if (table === "profiles_private") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
    return {}
  })

  const result = await approveBooking("booking-1", "ride-1")

  expect(result.error).toBe("Bookings.errors.offerDriverIbanRequired")
  expect(rpcMock).not.toHaveBeenCalled()
})

it("proceeds to the RPC when the offer is on a driver-posted ride (no IBAN check)", async () => {
  getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "driver" }))
  rpcMock.mockResolvedValue({ error: null })
  fromMock.mockReturnValue(fromReturningPassengerId("passenger-1"))

  const result = await approveBooking("booking-1", "ride-1")

  expect(result).toEqual({ success: true })
  expect(rpcMock).toHaveBeenCalledWith("approve_booking", { p_booking_id: "booking-1" })
})
```

`fakeRide` helper'ı (dosyanın başında tanımlı) `posted_by_role`/`posted_by` alanlarını da içerecek şekilde güncellenmeli — Task 4'ün `Ride` tipine eklediği alanları `fakeRide`'ın varsayılan değerlerine ekle (`posted_by_role: "driver"`, `posted_by: "driver-1"`, `driver_id: "driver-1"` zaten var).

- [ ] **Step 6: Testleri çalıştır**

```bash
npx vitest run src/features/bookings/actions.test.ts
```

Beklenen: hem yeni hem var olan testler PASS.

- [ ] **Step 7: Tam suite'i çalıştır**

```bash
npm test
```

Beklenen: hepsi PASS, önceki (Faz 1 sonrası) 150'den fazla.

- [ ] **Step 8: Commit**

```bash
git add src/features/rides/actions.test.ts src/features/bookings/actions.test.ts
git commit -m "$(cat <<'EOF'
posted_by geçişi ve yolcu-ilanı IBAN/plaka kontrolü için testler ekle

createRide/updateRide artık posted_by kullanıyor, approveBooking
yolcu-ilanı tekliflerinde teklif veren sürücünün ödeme bilgisini
kontrol ediyor — üçü de yeni unit testlerle kanıtlanıyor.
EOF
)"
```

---

### Task 8: Son doğrulama

**Files:** Yok.

- [ ] **Step 1: Tam kontrol seti**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

**Beklenen sonuç ve önemli uyarı:** `npx tsc --noEmit`'in bu noktada TEMİZ çıkması BEKLENMİYOR — Task 4, `Ride.driver_id`'yi nullable yaparak bu planın KASITLI OLARAK dokunmadığı UI dosyalarında (RideCard.tsx, RideFilters.tsx, vb. — Faz 2B'nin kapsamı) tsc hatalarına yol açar. Bu bir regresyon DEĞİL, bu planın kapsam sınırının doğal bir sonucu.

- [ ] **Step 2: Kalan tsc hatalarının hepsinin bu planın kapsamı dışındaki dosyalarda olduğunu doğrula**

```bash
npx tsc --noEmit 2>&1 | grep -oP '^[^(]+' | sort -u
```

Çıkan dosya listesini, bu planın Task 1-6'da değiştirdiği dosya listesiyle karşılaştır (`supabase/migrations/`, `src/types/ride.ts`, `src/types/booking.ts`, `src/features/rides/actions.ts`, `src/features/rides/queries.ts`, `src/features/bookings/actions.ts`, `src/features/bookings/queries.ts`, `messages/*.json`, test dosyaları). Bu listenin DIŞINDA bir dosyada hata varsa, o dosyanın adı ve hatası raporlanmalı ama DÜZELTİLMEMELİ (Faz 2B'nin işi).

- [ ] **Step 3: `npm run lint`, `npm test`, `npm run build` sonuçlarını doğrula**

Bu üçünün TEMİZ olması gerekiyor (tsc'nin aksine, bunlar kapsam dışı dosyalarda da regresyon göstermemeli — `npm run build` özellikle, tip hatası olan bir dosya varsa build'i de kırar; eğer build kırılıyorsa bu senin beklentinin aksine gerçek bir sorun, raporla ve düzeltme).

**Not:** Eğer `npm run build` tip hatası yüzünden kırılıyorsa (Next.js production build'i tip kontrolünü de yapar), bu planın "UI dosyalarına dokunmuyoruz" kapsamı ile çelişir — böyle bir durumda kullanıcıya durumu bildir, kendi başına UI dosyalarını düzeltmeye kalkışma (kapsam dışı), bunun yerine Faz 2B'nin bu planın hemen ardından, ayrı bir oturumda gerekli olduğunu netleştir.

- [ ] **Step 4: Kullanıcıya raporla**

Rapor: hangi 4 kontrolün (lint/tsc/test/build) hangi sonucu verdiği, tsc'nin kapsam-dışı dosyalarda beklenen hataları, kapsam dışı bırakılan 3 madde (Faz 2B: UI/i18n/e2e; OCR otomatik onayın yolcu-ilanına genişletilmemesi; sürücünün kendi teklifini geri çekememesi), sıradaki adım (Faz 2B planının bu planın ÜZERİNE, yeni bir writing-plans çağrısıyla yazılması gerektiği — bu plan Faz 2B'nin gerçek arayüzlerini (kolon adları, RPC hata mesajları) önceden tahmin etmiyor, önce bu plan uygulanıp gözden geçirilmeli).

---

## Self-Review Notu (plan yazarı için)

- **Kapsam eşleşmesi:** Tasarım dokümanının Faz 2 bölümündeki şema kararları (posted_by, bookings.driver_id, approve_booking genişletmesi, IBAN/plaka kontrolünün taşınması) → Task 1-6. RLS → Task 2. Test → Task 7. UI/i18n/e2e (RideForm rol seçimi, RideCard, RideFilters, `/rides/mine` sekmesi) BİLEREK bu planın dışında — ayrı bir "Faz 2B" planı gerekiyor, bunu Task 8'de ve plan başlığında açıkça belirttim.
- **Placeholder taraması:** Her SQL/TS/JSON bloğu tam kod. `rides/actions.test.ts`'in var olmadığı bu plan yazılırken doğrulandı (`ls src/features/rides/*.test.ts` çalıştırıldı, sadece `filters.test.ts`/`schemas.test.ts` bulundu) — Task 7 Step 1 artık "kontrol et" değil "oluştur" diyor, `redirect()` mock'lama kararı da (`vi.mock("next/navigation", ...)`, gerçek framework davranışına güvenmek yerine) baştan netleştirildi.
- **Tip tutarlılığı:** `Ride.driver_id: string | null` (Task 4) → Task 5/6'nın tüm `driver_id`-okuyan kodu bunu hesaba katıyor (`approveBooking`'in `ride?.posted_by_role` kontrolü, `offeringDriverId` null-check'i). `_apply_booking_approval`'ın 4-parametreli imzası Task 3'te tanımlanıp aynı migration içinde iki çağrı yerinde de kullanılıyor — tutarlı.
