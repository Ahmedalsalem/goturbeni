# Yolcu İlanları — Faz 2B: UI, Ödeme Sırası Düzeltmesi ve Uçtan Uca Akış Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faz 2A'nın backend temelini (rides.posted_by_role/posted_by, bookings.booker_role/driver_id, rol-farkında approve_booking/reject_booking) kullanıcının görüp kullanabileceği bir özelliğe dönüştür: yolcular "Yolcuyum" modunda ilan açabilsin, sürücüler bu ilanlara teklif verebilsin, ilan sahibi tekliflerden birini kabul edince normal chat/pickup/ödeme/review akışı sorunsuz devam etsin — ayrıca Faz 2A'yı uygulama sırasında keşfedilen, gerçek bir Supabase projesine deploy edilmeden görünmeyen üç kusur burada düzeltiliyor (aşağıya bakınız).

**Architecture:** Var olan sayfa/komponent yapısı korunuyor, yeni bir "teklif" akışı ekleniyor (`createOffer`, `OfferButton.tsx`) ve var olan sayfalar (`RideCard`, `/rides/[id]`, `/rides/[id]/bookings`, `/bookings`) `posted_by_role`/`booker_role`'e göre dallanıyor. Yeni bir tablo/route yok — Faz 2A'nın "var olan şemayı genişlet" ilkesi burada da geçerli.

**Tech Stack:** Next.js 15 (Server Actions, next-intl) + Supabase (Postgres, RLS, `security definer` RPC) + Vitest + Playwright.

## Global Constraints

- Son migration `0060`; yeni dosya `0061`.
- Sürücü-ilanı akışında (posted_by_role='driver', booker_role='passenger' — bugünkü tek durum) **sıfır davranış değişikliği** — her değişiklik bunun matematiksel olarak eşdeğer kaldığı gösterilerek doğrulanmalı, tıpkı Faz 2A'da olduğu gibi.
- Bu ortamda gerçek/bağlı bir Supabase projesi yok — migration'lar deploy edilemez, e2e testleri (Playwright, local Supabase gerektirir) bu ortamda ÇALIŞTIRILAMAZ. Doğrulama: SQL'in var olan fonksiyonlarla aynı desende olduğu, `npm run lint`/`npx tsc --noEmit`/`npm test`/`npm run build`.
- **Faz 2A'da keşfedilen ve bu planla düzeltilen 3 kusur** (kod okunarak doğrulandı, hiçbiri Faz 2A'nın kendi test/build koşusunda yakalanamazdı çünkü ikisi de gerçek bir Supabase/PostgREST örneği gerektiriyor):
  1. **PostgREST embed belirsizliği:** `rides` artık `profiles`'a 2 FK taşıyor (`driver_id`, `posted_by`), `bookings` da öyle (`passenger_id`, `driver_id`). Kod tabanındaki HER `profiles(...)` embed'i (constraint adı belirtilmeden) artık PostgREST'te "more than one relationship was found" hatası verir. Task 1'de düzeltiliyor.
  2. **Eşzamanlı sürücü teklifi engeli:** `bookings_one_active_per_passenger_ride` unique index'i `(ride_id, passenger_id)` üzerinde — bir yolcu ilanına verilen tüm tekliflerde `passenger_id` (ilan sahibi) AYNI olduğundan, ikinci bir sürücünün teklifi bu index'e çarpıp "zaten rezervasyonunuz var" hatası alırdı; oysa Faz 2A'nın kendi tasarım yorumları ("aynı ilana birden fazla sürücünün eşzamanlı teklifi") bunun çalışmasını varsayıyordu. Task 2'de düzeltiliyor.
  3. **Depozito sırası hatası (para ile ilgili, gerçek bug):** `_apply_booking_approval`, onay anında `payment_status`'u koşulsuz `'deposit_confirmed'` yapıyor — normal akışta doğru (sürücü zaten depozitoyu aldığı için onaylıyor), ama yolcu ilanı teklifinde ilan sahibi depozitoyu ödemeden ÖNCE onaylıyor (hangi sürücünün IBAN'ına ödeyeceğini onay anına kadar bilmiyor). Sonuç: teklif kabul edilir edilmez sistem depozitoyu "alındı" sayar, hiçbir depozito ödeme ekranı hiç gösterilmez. Task 2 + Task 9'da düzeltiliyor.
- **Kapsam dışı (bilerek yapılmayacak):** `repeatWeekly`/`ride_series` yolcu ilanlarında yok (form sadece sürücü modunda gösteriyor — Faz 2A'nın tasarım dokümanından). `submit_deposit_receipt_ocr`'ın yolcu-ilanı akışına genişletilmesi yok (otomatik depozito eşleştirmesi hâlâ sadece normal rezervasyonlarda çalışıyor, yolcu ilanı depozitoları her zaman elle/admin incelemesine düşer — Task 2'nin düzeltmesi bunu değiştirmiyor, sadece "hiç gösterilmeme" bug'ını çözüyor). Sürücünün kendi teklifini geri çekmesi VAR (Task 2), ama ilan sahibinin AYNI ilana gelen diğer bekleyen teklifleri otomatik reddetmesi YOK (elle reddeder — mevcut `/rides/[id]/bookings` sayfası zaten bunu destekliyor, bkz. Task 8).

---

### Task 1: PostgREST embed belirsizliğini düzelt + poster/teklif-veren-sürücü join'lerini ekle

**Files:**
- Modify: `src/features/rides/queries.ts:11`
- Modify: `src/features/bookings/queries.ts:7-8`
- Modify: `src/features/chat/queries.ts:55`
- Modify: `src/features/admin/queries.ts:9,22`
- Modify: `src/types/ride.ts`
- Modify: `src/types/booking.ts`

**Interfaces:**
- Produces: `RideWithDriver.poster: { full_name: string | null; avatar_url: string | null } | null` (yolcu ilanında `ride.driver` null olacağından kart/detay sayfaları bu alanı kullanacak — Task 6/7). `BookingWithPassenger.driver: { full_name: string | null; avatar_url: string | null } | null` (bir yolcu ilanına gelen teklifin, hangi sürücüden geldiğini göstermek için — Task 8).

- [ ] **Step 1: `src/types/ride.ts`'e `poster` alanı ekle**

```ts
export interface RideWithDriver extends Ride {
  driver: {
    full_name: string | null
    avatar_url: string | null
    car_brand: string | null
    car_model: string | null
    car_plate: string | null
  } | null
  poster: {
    full_name: string | null
    avatar_url: string | null
  } | null
}
```

- [ ] **Step 2: `src/types/booking.ts`'e `BookingWithPassenger.driver` alanı ekle**

```ts
export interface BookingWithPassenger extends Booking {
  passenger: {
    full_name: string | null
    avatar_url: string | null
  } | null
  driver: {
    full_name: string | null
    avatar_url: string | null
  } | null
}
```

- [ ] **Step 3: `src/features/rides/queries.ts:11`'i güncelle**

```ts
const RIDE_WITH_DRIVER_SELECT =
  "*, driver:profiles!rides_driver_id_fkey(full_name, avatar_url, car_brand, car_model, car_plate), poster:profiles!rides_posted_by_fkey(full_name, avatar_url)"
```

(FK adları Postgres'in varsayılan isimlendirmesi: `rides.driver_id` → `rides_driver_id_fkey` (0002_rides.sql'de inline `references`), `rides.posted_by` → `rides_posted_by_fkey` (0057_passenger_listings_schema.sql'de `alter table ... add column ... references`). Aynı desen `reviews/queries.ts`'teki `profiles!reviews_reviewer_id_fkey` embed'inde zaten kullanılıyor.)

- [ ] **Step 4: `src/features/bookings/queries.ts:7-8`'i güncelle**

```ts
const BOOKING_WITH_RIDE_SELECT = "*, ride:rides(*, driver:profiles!rides_driver_id_fkey(full_name, avatar_url))"
const BOOKING_WITH_PASSENGER_SELECT =
  "*, passenger:profiles!bookings_passenger_id_fkey(full_name, avatar_url), driver:profiles!bookings_driver_id_fkey(full_name, avatar_url)"
```

(`ride:rides(...)` kendisi belirsiz DEĞİL — `bookings.ride_id`'den `rides`'a tek bir FK var. Belirsiz olan, o gömülü `rides` seçiminin İÇİNDEKİ `driver:profiles(...)`.)

- [ ] **Step 5: `src/features/chat/queries.ts:55`'i güncelle**

```ts
    .select("passenger_id, passenger:profiles!bookings_passenger_id_fkey(full_name, avatar_url)")
```

- [ ] **Step 6: `src/features/admin/queries.ts:9` ve `:22`'yi güncelle**

```ts
const RIDE_WITH_DRIVER_SELECT = "*, driver:profiles!rides_driver_id_fkey(full_name, avatar_url)"
```

```ts
const ADMIN_BOOKING_SELECT =
  "*, passenger:profiles!bookings_passenger_id_fkey(id, full_name, created_at, admin_flags(is_suspended)), ride:rides(departure_city, arrival_city, driver:profiles!rides_driver_id_fkey(full_name))"
```

- [ ] **Step 7: `npx tsc --noEmit` ve `npm run lint` çalıştır, temiz çıktığını doğrula**

Bu adım sadece select string'leri ve tip alanları değiştiriyor — gerçek bir Supabase örneği olmadığı için PostgREST'in embed'i gerçekten çözebildiğini burada test EDEMEYİZ (bkz. Global Constraints); doğrulama sadece TS/lint seviyesinde.

- [ ] **Step 8: Commit**

```bash
git add src/types/ride.ts src/types/booking.ts src/features/rides/queries.ts src/features/bookings/queries.ts src/features/chat/queries.ts src/features/admin/queries.ts
git commit -m "$(cat <<'EOF'
PostgREST profiles embed belirsizliğini düzelt, poster/driver join'leri ekle

rides ve bookings artık profiles'a 2'şer FK taşıyor (Faz 2A) — her
unqualified profiles(...) embed'i PostgREST'te "more than one
relationship" hatası verirdi (gerçek bir Supabase'e deploy edilene
kadar görünmeyen bir kusur). Tüm embed'ler FK adıyla nitelendirildi;
aynı taşımada RideWithDriver.poster ve BookingWithPassenger.driver
eklendi (yolcu ilanı UI'ının ihtiyaç duyacağı join'ler).
EOF
)"
```

---

### Task 2: Migration 0061 — teklif uniqueness, cancel_booking rol-farkında yetki, depozito sırası düzeltmesi

**Files:**
- Create: `supabase/migrations/0061_passenger_listing_offer_fixes.sql`

**Interfaces:**
- Produces: `bookings_one_active_offer_per_driver_ride` unique index (yeni). `cancel_booking(uuid)` — gövde rol-farkında (`booker_role='driver'` satırlarında `driver_id` sahibi de iptal edebilir). `_apply_booking_approval(uuid, uuid, integer, uuid)` — `payment_status`'u artık `booker_role`'e göre koşullu set ediyor.

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Faz 2B — Faz 2A'da (0057-0059) tasarlanan ama gerçek bir Supabase örneği
-- olmadan test edilemeyen üç eksik burada düzeltiliyor:
--
-- 1) bookings_one_active_per_passenger_ride (0003), (ride_id, passenger_id)
-- üzerinde tanımlıydı — normal rezervasyonlarda passenger_id her zaman farklı
-- bir kişiydi, "aynı yolcu aynı ilana iki kez rezervasyon açamaz" demekti.
-- Bir yolcu ilanına verilen tekliflerde (booker_role='driver') passenger_id
-- HER ZAMAN ilan sahibiyle aynı (teklif veren sürücü değil) — bu yüzden
-- ikinci bir sürücü teklif vermeye çalıştığında bu index'e çarpardı, oysa
-- Faz 2A'nın 0057'deki kendi tasarım yorumu ("aynı ilana birden fazla
-- sürücünün eşzamanlı teklifi") bunun çalışmasını varsayıyordu. İndeks
-- role-scoped hale getiriliyor: passenger_id kısıtı sadece
-- booker_role='passenger' satırlarına uygulanıyor (davranış birebir aynı),
-- driver_id üzerinde YENİ bir kısıt ekleniyor (bir sürücü aynı ilana aynı
-- anda iki teklif veremez, ama farklı sürücüler verebilir).
drop index public.bookings_one_active_per_passenger_ride;

create unique index bookings_one_active_per_passenger_ride on public.bookings (ride_id, passenger_id)
  where status in ('pending', 'approved') and booker_role = 'passenger';

create unique index bookings_one_active_offer_per_driver_ride on public.bookings (ride_id, driver_id)
  where status in ('pending', 'approved') and booker_role = 'driver';

-- 2) cancel_booking (son hâli 0041_no_show_and_late_cancellation.sql'de)
-- sadece passenger_id <> auth.uid() kontrolü yapıyordu — bir yolcu ilanına
-- teklif veren sürücü için passenger_id ilan sahibi olduğundan (driver_id
-- DEĞİL), teklif veren sürücü kendi bekleyen teklifini hiçbir zaman iptal
-- edemiyordu (Faz 2A'nın kendi Self-Review notunda "deferred" diye
-- işaretlenmişti). booker_role='passenger' satırlarında davranış birebir
-- korunuyor.
create or replace function public.cancel_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.booker_role = 'driver' then
    if v_booking.driver_id <> auth.uid() then
      raise exception 'not_booking_owner';
    end if;
  else
    if v_booking.passenger_id <> auth.uid() then
      raise exception 'not_booking_owner';
    end if;
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'booking_not_cancellable';
  end if;

  if v_booking.status = 'approved' then
    update public.rides
      set available_seats = available_seats + v_booking.seat_count,
          status = case when status = 'full' then 'active' else status end
      where id = v_booking.ride_id;
  end if;

  update public.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        seat_freed_at = case when v_booking.status = 'approved' then now() else null end
    where id = p_booking_id;

  return v_booking.status = 'approved';
end;
$$;

-- 3) _apply_booking_approval (0059), onay anında payment_status'u koşulsuz
-- 'deposit_confirmed' yapıyordu — normal akışta doğru (sürücü depozitoyu
-- ZATEN aldığı için onaylıyor, "Kaporayı Aldım, Onayla" butonunun kendi
-- anlamı bu). Ama bir yolcu ilanı teklifinde ilan sahibi hangi sürücünün
-- IBAN'ına ödeyeceğini onaydan ÖNCE bilemez (sürücü onay anına kadar
-- belirsiz) — depozito fiilen ONAY SONRASI ödenir. Koşulsuz
-- 'deposit_confirmed' ataması bu durumda parayı hiç hareket etmeden
-- "alındı" sayıyordu ve BookingButton.tsx'in depozito ekranı zaten
-- status='pending' şartına bağlı olduğundan (bkz. src/app/bookings/page.tsx
-- Task 9) o ekran da hiç görünmüyordu. booker_role='driver' satırlarında
-- payment_status artık DOKUNULMUYOR (varsayılan 'awaiting_deposit' kalıyor);
-- booker_role='passenger' satırlarında davranış birebir korunuyor.
create or replace function public._apply_booking_approval(
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
    set status = 'approved',
        payment_status = case when booker_role = 'driver' then payment_status else 'deposit_confirmed' end
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;
```

- [ ] **Step 2: Her değişikliğin sürücü-ilanı/normal-rezervasyon durumunda eski davranışla eşdeğer olduğunu masaüstünde doğrula**

Üçü için de `booker_role = 'passenger'` (bugünkü tek durum) yerine koy: (1) yeni `bookings_one_active_per_passenger_ride` WHERE'i `booker_role='passenger'` ekliyor ama normal rezervasyonlar zaten hep bu değere sahip, index'in kapsadığı satır kümesi değişmiyor. (2) `cancel_booking`'in `if v_booking.booker_role = 'driver'` dalı hiç çalışmıyor, `else` dalı eski `if v_booking.passenger_id <> auth.uid()` ile birebir aynı. (3) `_apply_booking_approval`'ın CASE'i `booker_role='passenger'` için her zaman `'deposit_confirmed'` üretiyor — eski koşulsuz atamayla aynı sonuç. Bunu Task raporuna yaz.

- [ ] **Step 3: `npm run lint` ve `npx tsc --noEmit` çalıştır**

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0061_passenger_listing_offer_fixes.sql
git commit -m "$(cat <<'EOF'
Faz 2A'nın 3 eksiğini düzelt: teklif uniqueness, cancel_booking, depozito sırası

bookings_one_active_per_passenger_ride artık booker_role-scoped (aynı
ilana birden fazla sürücü teklif verebilsin diye Faz 2A'nın kendi
tasarımının varsaydığı ama gerçekte engellediği durum). cancel_booking
teklif veren sürücünün kendi bekleyen teklifini iptal edebilmesini
sağlıyor. _apply_booking_approval artık booker_role='driver' onaylarında
payment_status'a dokunmuyor (depozito onay SONRASI ödeniyor, önceden
koşulsuz 'deposit_confirmed' ataması bunu atlıyordu — gerçek bir bug).
Sürücü ilanı/normal rezervasyon davranışı üçünde de birebir korunuyor.
EOF
)"
```

---

### Task 3: `bookings` — `createOffer` action + `getMyOfferForRide`/`getMyDriverOffers` query'leri

**Files:**
- Modify: `src/features/bookings/queries.ts`
- Modify: `src/features/bookings/actions.ts`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: `getRide` (`@/features/rides/queries`), Task 2'nin `bookings_one_active_offer_per_driver_ride` index'i (23505 çakışma kodu).
- Produces: `getMyOfferForRide(rideId, driverId): Promise<Booking | null>` (bir sürücünün belirli bir ilana verdiği aktif teklif — `getMyBookingForRide`'ın aynısı deseninde, ama `driver_id`/`booker_role='driver'` üzerinden). `getMyDriverOffers(driverId): Promise<BookingWithRide[]>` (bir sürücünün verdiği TÜM teklifler, `/bookings` sayfası için — Task 9). `createOffer(rideId): Promise<BookingActionState>`.

- [ ] **Step 1: `bookings/queries.ts`'e iki query ekle**

`getMyBookingForRide`'ın hemen altına:

```ts
// createOffer/OfferButton, bir sürücünün bir yolcu ilanına zaten aktif bir
// teklifi olup olmadığını (varsa durumunu) göstermek için kullanır —
// getMyBookingForRide'ın aynısı, ama passenger_id yerine driver_id/
// booker_role üzerinden (bir teklifte passenger_id ilan sahibidir, teklif
// veren sürücü değil).
export async function getMyOfferForRide(rideId: string, driverId: string): Promise<Booking | null> {
  if (!isSupabaseConfigured()) {
    return null
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("ride_id", rideId)
    .eq("driver_id", driverId)
    .eq("booker_role", "driver")
    .in("status", ["pending", "approved"])
    .maybeSingle()

  return data as Booking | null
}

// /bookings sayfasının "Verdiğim Teklifler" bölümü için — bir sürücünün
// başkalarının yolcu ilanlarına verdiği TÜM teklifler (durumu ne olursa
// olsun), en yeniden eskiye.
export async function getMyDriverOffers(driverId: string): Promise<BookingWithRide[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_RIDE_SELECT)
    .eq("driver_id", driverId)
    .eq("booker_role", "driver")
    .order("created_at", { ascending: false })

  return (data as BookingWithRide[] | null) ?? []
}
```

- [ ] **Step 2: `messages/tr.json`'a yeni anahtarlar ekle**

`Bookings.actions` içine, `reserve`'in hemen altına:

```json
      "makeOffer": "Teklif Ver",
      "manageOffer": "Teklifi Yönet",
      "approveOffer": "Teklifi Kabul Et",
      "confirmApproveOffer": "Teklifi kabul etmek istediğinize emin misiniz?",
```

`Bookings.success` içine, `created`'ın hemen altına:

```json
      "offerCreated": "Teklifiniz gönderildi.",
      "offerApproved": "Teklif kabul edildi.",
```

`Bookings.errors` içine, `ownRide`'ın hemen altına:

```json
      "notPassengerListing": "Bu ilana teklif veremezsiniz.",
      "alreadyOffered": "Bu ilana zaten bir teklifiniz var.",
```

- [ ] **Step 3: `messages/en.json`'a aynı anahtarları ekle**

```json
      "makeOffer": "Make an Offer",
      "manageOffer": "Manage Offer",
      "approveOffer": "Accept Offer",
      "confirmApproveOffer": "Are you sure you want to accept this offer?",
```

```json
      "offerCreated": "Your offer has been sent.",
      "offerApproved": "Offer accepted.",
```

```json
      "notPassengerListing": "You can't make an offer on this listing.",
      "alreadyOffered": "You already have an offer on this listing.",
```

- [ ] **Step 4: `messages/ar.json`'a aynı anahtarları ekle**

```json
      "makeOffer": "قدّم عرضًا",
      "manageOffer": "إدارة العرض",
      "approveOffer": "قبول العرض",
      "confirmApproveOffer": "هل أنت متأكد أنك تريد قبول هذا العرض؟",
```

```json
      "offerCreated": "تم إرسال عرضك.",
      "offerApproved": "تم قبول العرض.",
```

```json
      "notPassengerListing": "لا يمكنك تقديم عرض على هذا الإعلان.",
      "alreadyOffered": "لديك بالفعل عرض على هذا الإعلان.",
```

- [ ] **Step 5: `bookings/actions.ts`'e `createOffer` ekle**

`createBooking`'in hemen altına (aynı dosyada, `getRide`/`checkRateLimit`/`requireVerifiedProfile` zaten import edilmiş):

```ts
// createBooking'in "ters" versiyonu — bir sürücü, bir yolcu ilanına teklif
// verir. seat_count kullanıcıdan alınmaz: bir yolcu ilanı tek bir sürücü
// tarafından TAM karşılanır (kısmi teklif yok, bkz. tasarım dokümanı),
// dolayısıyla her zaman ride.seat_count kadar. IBAN/plaka kontrolü burada
// YAPILMAZ — approveBooking'e taşındı (ilan sahibi onaylayana kadar hangi
// sürücünün teklifinin kabul edileceği belli değil).
export async function createOffer(rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const user = await requireVerifiedProfile()
  if (!(await checkRateLimit(`create-offer:${user.id}`, CREATE_BOOKING_RATE_LIMIT.limit, CREATE_BOOKING_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const ride = await getRide(rideId)
  if (!ride || ride.status !== "active") {
    return { error: tErrors("rideNotActive") }
  }
  if (ride.posted_by_role !== "passenger") {
    return { error: tErrors("notPassengerListing") }
  }
  if (ride.posted_by === user.id) {
    return { error: tErrors("ownRide") }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("bookings").insert({
    ride_id: rideId,
    passenger_id: ride.posted_by,
    booker_role: "driver",
    driver_id: user.id,
    seat_count: ride.seat_count,
  })

  if (error) {
    // 23505 = unique_violation — Task 2'nin bookings_one_active_offer_per_driver_ride'ı.
    if (error.code !== "23505") {
      logError(error, "bookings.createOffer")
    }
    return { error: error.code === "23505" ? tErrors("alreadyOffered") : tErrors("createFailed") }
  }

  await Promise.all([
    sendPushNotification({ type: "booking_requested", recipientId: ride.posted_by, rideId }),
    sendEmailNotification({ type: "booking_requested", recipientId: ride.posted_by, rideId }),
    recordNotificationEvent({ type: "booking_requested", recipientId: ride.posted_by, rideId }),
  ])

  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}
```

- [ ] **Step 6: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 7: Commit**

```bash
git add src/features/bookings/queries.ts src/features/bookings/actions.ts messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
bookings: createOffer action + getMyOfferForRide/getMyDriverOffers query'leri

createBooking'in tersi — bir sürücü bir yolcu ilanına teklif verir
(seat_count her zaman ride.seat_count, kısmi teklif yok). IBAN/plaka
kontrolü burada değil, approveBooking'de (Faz 2A'dan zaten vardı).
EOF
)"
```

---

### Task 4: `rides` — yolcu-modu `createRide` (şema + action)

**Files:**
- Modify: `src/features/rides/schemas.ts`
- Modify: `src/features/rides/actions.ts`

**Interfaces:**
- Produces: `RideFormValues.postedByRole: "driver" | "passenger"` (yeni alan, default `"driver"`). Yolcu modunda `petsAllowed`/`smokingAllowed`/`vipSolo`/`repeatWeekly` şema seviyesinde `false`'a zorlanır (form bunları zaten gizleyecek — Task 5 — ama bu, tamperlenmiş bir isteğe karşı da güvence).

- [ ] **Step 1: `schemas.ts`'e `postedByRole` alanı + zorlayıcı transform ekle**

`buildRideSchema`'nın `.object({...})` bloğunun en başına (`departureCity`'den önce):

```ts
      postedByRole: z.enum(["driver", "passenger"]).default("driver"),
```

Fonksiyonun son `.refine(...)` zincirinin (vipSoloSingleSeat) hemen altına, yeni bir `.transform` ekle:

```ts
    .refine((data) => !data.vipSolo || data.seatCount === 1, {
      message: t("vipSoloSingleSeat"),
      path: ["seatCount"],
    })
    // Yolcu ilanında araç/politika alanları anlamsız (ilan sahibi henüz
    // sürücü değil) — form bunları zaten gizliyor (Task 5), ama şema
    // seviyesinde de zorlanıyor ki tamperlenmiş bir istek bu alanları
    // dolaylı yoldan set edemesin.
    .transform((data) =>
      data.postedByRole === "passenger"
        ? { ...data, petsAllowed: false, smokingAllowed: false, vipSolo: false, repeatWeekly: false }
        : data
    )
```

- [ ] **Step 2: `actions.ts`'in `createRide`'ını yolcu moduna göre dallandır**

`createRide` fonksiyonunun IBAN/plaka kontrolünden insert'e kadar olan gövdesini değiştir:

```ts
  const supabase = await createClient()
  const isPassengerListing = parsed.data.postedByRole === "passenger"

  // Yolcu ilanında henüz bir sürücü/araç yok — IBAN + plaka kontrolü (sürücü
  // ilanında burada, ilan açılışında yapılırdı) teklif veren sürücüye
  // taşınıyor, approveBooking'de kontrol ediliyor (Faz 2A, bkz.
  // bookings/actions.ts).
  if (!isPassengerListing) {
    // Sürücü IBAN + hesap sahibi adı olmadan ilan açamaz (bkz. "Yarı-Yarı
    // Ödeme Akışı" — yolcunun ilk yarı ödemesini gönderebilmesi için ilan
    // sahibinin ödeme bilgisi baştan tam olmalı).
    const { data: paymentInfo } = await supabase.from("profiles_private").select("iban, iban_holder_name").eq("id", user.id).maybeSingle()
    if (!paymentInfo?.iban || !paymentInfo?.iban_holder_name) {
      return { error: tErrors("ibanRequired") }
    }

    // Sürücü geçerli formatta bir plaka olmadan ilan açamaz — yolcunun aracı
    // teşhis edebilmesi (bkz. 0050_car_plate.sql) artık zorunlu.
    const { data: driverProfile } = await supabase.from("profiles").select("car_plate").eq("id", user.id).maybeSingle()
    if (!driverProfile?.car_plate || !TR_PLATE_PATTERN.test(driverProfile.car_plate)) {
      return { error: tErrors("carPlateRequired") }
    }
  }

  const { data: ride, error } = await supabase
    .from("rides")
    .insert({
      driver_id: isPassengerListing ? null : user.id,
      posted_by_role: parsed.data.postedByRole,
      posted_by: user.id,
      ...buildRideRow(parsed.data),
    })
    .select("id")
    .single()
```

(`updateRide`/`cancelRide`/`buildRideRow` dokunulmuyor — `buildRideRow` zaten `posted_by_role`/`posted_by`/`driver_id`'yi hiç okumuyor, `updateRide` bu üçünü hiç update etmiyor, yani bir ilanın rolü DÜZENLEME sırasında asla değişemez, sadece oluşturma anında belirlenir.)

- [ ] **Step 3: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 4: Commit**

```bash
git add src/features/rides/schemas.ts src/features/rides/actions.ts
git commit -m "$(cat <<'EOF'
rides: yolcu-modu createRide (postedByRole şeması + dallanan IBAN/plaka kontrolü)

Yolcu ilanında driver_id NULL, IBAN/plaka kontrolü atlanıyor (teklif
veren sürücüye taşındı, Faz 2A). pets/smoking/vip/repeatWeekly şema
seviyesinde false'a zorlanıyor. updateRide/cancelRide değişmedi —
posted_by_role bir ilanın ömrü boyunca sabit.
EOF
)"
```

---

### Task 5: `RideForm.tsx` — rol seçimi UI

**Files:**
- Modify: `src/features/rides/RideForm.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: Task 4'ün `postedByRole` alanı.

- [ ] **Step 1: `messages/tr.json`'a `Rides.form` içine yeni anahtarlar ekle**

`optional`'ın hemen altına:

```json
    "postedByRoleLabel": "İlan Türü",
    "iAmDriver": "Sürücüyüm",
    "iAmPassenger": "Yolcuyum",
```

- [ ] **Step 2: `messages/en.json`'a aynı konumda ekle**

```json
    "postedByRoleLabel": "Listing Type",
    "iAmDriver": "I'm a driver",
    "iAmPassenger": "I'm a passenger",
```

- [ ] **Step 3: `messages/ar.json`'a aynı konumda ekle**

```json
    "postedByRoleLabel": "نوع الإعلان",
    "iAmDriver": "أنا سائق",
    "iAmPassenger": "أنا راكب",
```

- [ ] **Step 4: `RideForm.tsx`'e rol toggle'ı ekle**

`defaultValues` objesine, en başa `postedByRole` ekle:

```ts
    defaultValues: {
      postedByRole: ride?.posted_by_role ?? "driver",
      departureCity: (ride?.departure_city as RideFormInput["departureCity"]) ?? ("" as RideFormInput["departureCity"]),
      ...
```

`departureCity`/`arrivalCity`'nin `watch` satırlarının hemen altına yeni bir türetilmiş değer ekle:

```ts
  const departureCity = watch("departureCity")
  const arrivalCity = watch("arrivalCity")
  const postedByRole = watch("postedByRole")
  const isPassengerMode = postedByRole === "passenger"
```

`<FieldGroup>`'un İÇİNDE, en üste (departureCity/arrivalCity grid'inden önce), rol seçimi ekle — sadece oluşturma modunda (`!ride`) gösterilir, çünkü bir ilanın rolü düzenlemede değiştirilemez (Task 4):

```tsx
      <FieldGroup>
        {!ride && (
          <Field>
            <FieldLabel>{t("postedByRoleLabel")}</FieldLabel>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={postedByRole === "driver" ? "default" : "outline"}
                onClick={() => setValue("postedByRole", "driver")}
              >
                {t("iAmDriver")}
              </Button>
              <Button
                type="button"
                variant={postedByRole === "passenger" ? "default" : "outline"}
                onClick={() => setValue("postedByRole", "passenger")}
              >
                {t("iAmPassenger")}
              </Button>
            </div>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="departureCity">{t("departureCity")}</FieldLabel>
```

(`departureCity`'den başlayan mevcut blok aynı kalıyor, sadece yeni `Field` onun ÜSTÜNE ekleniyor.)

Pets/smoking/vip checkbox `Field`'larının HER ÜÇÜNÜ de (`petsAllowed`, `smokingAllowed`, `vipSolo` — mevcut sırayla, `vipSoloHint`'in `{watch("vipSolo") && ...}` satırı dahil) `{!isPassengerMode && (...)}` ile sarmala:

```tsx
        {!isPassengerMode && (
          <>
            <Field orientation="horizontal">
              <Controller
                control={control}
                name="petsAllowed"
                render={({ field }) => (
                  <Checkbox id="petsAllowed" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              <FieldLabel htmlFor="petsAllowed" className="font-normal">
                {t("petsAllowed")}
              </FieldLabel>
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="smokingAllowed"
                render={({ field }) => (
                  <Checkbox id="smokingAllowed" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                )}
              />
              <FieldLabel htmlFor="smokingAllowed" className="font-normal">
                {t("smokingAllowed")}
              </FieldLabel>
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="vipSolo"
                render={({ field }) => (
                  <Checkbox
                    id="vipSolo"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      const isVip = checked === true
                      field.onChange(isVip)
                      if (isVip) {
                        setValue("seatCount", 1)
                      }
                    }}
                  />
                )}
              />
              <FieldLabel htmlFor="vipSolo" className="font-normal">
                {t("vipSolo")}
              </FieldLabel>
            </Field>
            {watch("vipSolo") && <FieldDescription>{t("vipSoloHint")}</FieldDescription>}
          </>
        )}

        {!ride && !isPassengerMode && (
          <Field orientation="horizontal">
            <Controller
              control={control}
              name="repeatWeekly"
              render={({ field }) => (
                <Checkbox id="repeatWeekly" checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              )}
            />
            <FieldLabel htmlFor="repeatWeekly" className="font-normal">
              {t("repeatWeekly")}
            </FieldLabel>
          </Field>
        )}
        {!isPassengerMode && watch("repeatWeekly") && <FieldDescription>{t("repeatWeeklyHint")}</FieldDescription>}
```

(Sadece `{!ride && (...)}` → `{!ride && !isPassengerMode && (...)}` ve son satıra `!isPassengerMode &&` eklendi — geri kalan `repeatWeekly` bloğu aynı.)

- [ ] **Step 5: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 6: Dev server'da elle doğrula**

`npm run dev`, `/create-ride`'a git, "Yolcuyum"a tıkla → evcil hayvan/sigara/VIP/haftalık tekrar alanlarının kaybolduğunu, "Sürücüyüm"e geri dönünce tekrar göründüğünü doğrula. `/rides/[id]/edit` (var olan bir sürücü ilanı) → rol toggle'ının hiç görünmediğini doğrula.

- [ ] **Step 7: Commit**

```bash
git add src/features/rides/RideForm.tsx messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
RideForm: Sürücüyüm/Yolcuyum rol seçimi

Sadece oluşturma modunda gösteriliyor (rol düzenlemede sabit, Task 4).
Yolcu modunda evcil hayvan/sigara/VIP/haftalık-tekrar alanları
gizleniyor.
EOF
)"
```

---

### Task 6: `RideCard.tsx` + `RideFilters.tsx` + `filters.ts` — ilan türü rozeti ve filtresi

**Files:**
- Modify: `src/features/rides/RideCard.tsx`
- Modify: `src/features/rides/filters.ts`
- Modify: `src/features/rides/RideFilters.tsx`
- Modify: `src/features/rides/queries.ts`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: Task 1'in `RideWithDriver.poster` alanı.
- Produces: `RideSearchFilters.postedByRole?: "driver" | "passenger"`.

- [ ] **Step 1: i18n anahtarlarını ekle — `messages/tr.json`**

`Rides.card` içine, `vipSolo`'nun hemen altına:

```json
    "unknownPoster": "Yolcu",
    "passengerListingBadge": "Yolcu İlanı",
    "driverListingBadge": "Sürücü İlanı"
```

(Not: `vipSolo` satırından sonra virgül eklemeyi unutma, yeni son satır virgülsüz kalmalı.)

`RidesPage.filters` içine, `femaleDriverOnly`'nin hemen altına:

```json
  "typeLabel": "İlan Türü",
  "typeAll": "Tümü",
  "typeDriver": "Sürücü İlanları",
  "typePassenger": "Yolcu İlanları",
```

- [ ] **Step 2: Aynı anahtarları `messages/en.json`'a ekle**

```json
    "unknownPoster": "Passenger",
    "passengerListingBadge": "Passenger Listing",
    "driverListingBadge": "Driver Listing"
```

```json
  "typeLabel": "Listing Type",
  "typeAll": "All",
  "typeDriver": "Driver Listings",
  "typePassenger": "Passenger Listings",
```

- [ ] **Step 3: Aynı anahtarları `messages/ar.json`'a ekle**

```json
    "unknownPoster": "راكب",
    "passengerListingBadge": "إعلان راكب",
    "driverListingBadge": "إعلان سائق"
```

```json
  "typeLabel": "نوع الإعلان",
  "typeAll": "الكل",
  "typeDriver": "إعلانات السائقين",
  "typePassenger": "إعلانات الركاب",
```

- [ ] **Step 4: `RideCard.tsx`'i güncelle**

```tsx
export async function RideCard({ ride, actions }: { ride: RideWithDriver; actions?: React.ReactNode }) {
  const t = await getTranslations("Rides.card")
  const format = await getFormatter()
  const locale = await getUserLocale()

  const departureAt = new Date(ride.departure_time)
  const isPassengerListing = ride.posted_by_role === "passenger"
  const posterName = isPassengerListing ? (ride.poster?.full_name ?? t("unknownPoster")) : (ride.driver?.full_name ?? t("unknownDriver"))
  const posterAvatarUrl = isPassengerListing ? ride.poster?.avatar_url : ride.driver?.avatar_url
  const posterInitials = posterName.slice(0, 2).toUpperCase()
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)

  return (
    <Card className="ring-foreground/5 border-0 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/5">
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link
          href={`/rides/${ride.id}`}
          className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight hover:text-primary"
        >
          <MapPin className="text-muted-foreground size-4" aria-hidden="true" />
          {ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity}
          <ArrowRight className="text-muted-foreground size-4 rtl:-scale-x-100" aria-hidden="true" />
          {ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity}
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant={isPassengerListing ? "secondary" : "outline"} className="gap-1">
            <Users className="size-3" aria-hidden="true" /> {isPassengerListing ? t("passengerListingBadge") : t("driverListingBadge")}
          </Badge>
          {ride.vip_solo && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="size-3" aria-hidden="true" /> {t("vipSolo")}
            </Badge>
          )}
          <RideStatusBadge status={ride.status} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3.5 text-sm sm:grid-cols-4">
        <div className="text-muted-foreground flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden="true" />
          {format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          <Clock className="size-4" aria-hidden="true" />
          {format.dateTime(departureAt, { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          <Users className="size-4" aria-hidden="true" />
          {t("availableSeats", { count: ride.available_seats })}
        </div>
        <div className="text-primary font-semibold">{formatCostShare(ride.cost_share, locale)}</div>
      </CardContent>
      {(ride.pets_allowed || ride.smoking_allowed) && (
        <CardContent className="flex flex-wrap gap-1.5 pt-0">
          {ride.pets_allowed && (
            <Badge variant="outline" className="gap-1">
              <PawPrint className="size-3" aria-hidden="true" /> {t("petsAllowed")}
            </Badge>
          )}
          {ride.smoking_allowed && (
            <Badge variant="outline" className="gap-1">
              <Cigarette className="size-3" aria-hidden="true" /> {t("smokingAllowed")}
            </Badge>
          )}
        </CardContent>
      )}
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t-0 bg-transparent pt-1">
        <div className="flex items-center gap-2.5">
          <Avatar className="ring-border size-9 ring-1">
            <AvatarImage src={posterAvatarUrl ?? undefined} alt={posterName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{posterInitials}</AvatarFallback>
          </Avatar>
          <div>
            <span className="text-sm font-medium">{posterName}</span>
            {!isPassengerListing && (ride.driver?.car_brand || ride.driver?.car_model || ride.driver?.car_plate) && (
              <p className="text-muted-foreground text-xs">
                {[
                  [ride.driver?.car_brand, ride.driver?.car_model].filter(Boolean).join(" "),
                  ride.driver?.car_plate,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
        {actions}
      </CardFooter>
    </Card>
  )
}
```

- [ ] **Step 5: `filters.ts`'e `postedByRole` ekle**

`RideSearchFilters` interface'ine ekle:

```ts
export interface RideSearchFilters {
  from?: TurkishProvince
  to?: TurkishProvince
  fromDistrict?: string
  toDistrict?: string
  date?: string
  sort: RideSort
  petsAllowed?: boolean
  smokingAllowed?: boolean
  vipOnly?: boolean
  femaleDriverOnly?: boolean
  postedByRole?: "driver" | "passenger"
}
```

`parseRideSearchParams`'a ekle (fonksiyonun başına):

```ts
  const postedByRole = firstValue(searchParams.type)
```

Return objesine ekle (`femaleDriverOnly`'nin hemen altına):

```ts
    postedByRole: postedByRole === "driver" || postedByRole === "passenger" ? postedByRole : undefined,
```

- [ ] **Step 6: `rides/queries.ts`'in iki query-builder'ına filtreyi uygula**

`buildRidesQuery`'ye, `femaleDriverRideIds` bloğunun hemen altına:

```ts
  if (filters?.postedByRole) {
    query = query.eq("posted_by_role", filters.postedByRole)
  }
```

`buildNearbyProvinceRidesQuery`'ye, aynı konuma:

```ts
  if (filters.postedByRole) {
    query = query.eq("posted_by_role", filters.postedByRole)
  }
```

- [ ] **Step 7: `RideFilters.tsx`'e tür filtresi ekle**

`buildQueryString`'e ekle (`femaleDriverOnly`'nin hemen altına):

```ts
  if (filters.postedByRole) params.set("type", filters.postedByRole)
```

`RideFilters` fonksiyonuna state ekle (`femaleDriverOnly` state'inin hemen altına):

```ts
  const [postedByRole, setPostedByRole] = useState<"driver" | "passenger" | undefined>(initial.postedByRole)
```

`onSearch`/`onSortChange`'in `buildQueryString` çağrılarına `postedByRole` ekle (her iki çağrıda da `femaleDriverOnly,`'nin hemen altına):

```ts
        postedByRole,
```

Checkbox grid'inin (`grid grid-cols-2 gap-x-4 gap-y-2 sm:pb-2.5` div'i) İÇİNE, `femaleDriverOnly` checkbox'ının hemen altına, `Select` ile bir tür filtresi ekle (zaten import edilmiş `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` kullanılıyor):

```tsx
          <Field orientation="horizontal">
            <Checkbox
              id="filter-female-driver-only"
              checked={femaleDriverOnly}
              onCheckedChange={(checked) => setFemaleDriverOnly(checked === true)}
            />
            <FieldLabel htmlFor="filter-female-driver-only" className="font-normal">
              {t("femaleDriverOnly")}
            </FieldLabel>
          </Field>
        </div>

        <Field className="sm:w-44">
          <FieldLabel htmlFor="filter-type">{t("typeLabel")}</FieldLabel>
          <Select
            value={postedByRole ?? "all"}
            onValueChange={(value) => setPostedByRole(value === "all" ? undefined : (value as "driver" | "passenger"))}
          >
            <SelectTrigger id="filter-type" aria-label={t("typeLabel")} className="w-full">
              <SelectValue>{(value: string) => (value === "all" ? t("typeAll") : value === "driver" ? t("typeDriver") : t("typePassenger"))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("typeAll")}</SelectItem>
              <SelectItem value="driver">{t("typeDriver")}</SelectItem>
              <SelectItem value="passenger">{t("typePassenger")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
```

(Dikkat: yukarıdaki blokta orijinal `</div>` — checkbox grid'ini kapatan — korunuyor, yeni `Field` ondan HEMEN SONRA, aynı `flex flex-wrap items-end gap-4` üst konteynerinin içinde bir kardeş eleman olarak ekleniyor.)

- [ ] **Step 8: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 9: `filters.test.ts`'e regresyon testi ekle**

`src/features/rides/filters.test.ts`'i aç, `parseRideSearchParams` testlerinin yanına:

```ts
it("parses a valid type filter and drops an invalid one", () => {
  expect(parseRideSearchParams({ type: "passenger" }).postedByRole).toBe("passenger")
  expect(parseRideSearchParams({ type: "driver" }).postedByRole).toBe("driver")
  expect(parseRideSearchParams({ type: "bogus" }).postedByRole).toBeUndefined()
  expect(parseRideSearchParams({}).postedByRole).toBeUndefined()
})
```

- [ ] **Step 10: Testleri çalıştır**

```bash
npx vitest run src/features/rides/filters.test.ts
```

Beklenen: yeni test PASS.

- [ ] **Step 11: Commit**

```bash
git add src/features/rides/RideCard.tsx src/features/rides/filters.ts src/features/rides/filters.test.ts src/features/rides/RideFilters.tsx src/features/rides/queries.ts messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
RideCard/RideFilters: ilan türü rozeti + filtresi

RideCard artık posted_by_role'e göre poster (yolcu) veya driver
(sürücü) bilgisini gösteriyor, iki rozetten biriyle ("Yolcu İlanı" /
"Sürücü İlanı") etiketliyor. RidesPage.filters'a "İlan Türü" (Tümü/
Sürücü/Yolcu) eklendi, getRides'ın iki query-builder'ı da bunu
uyguluyor.
EOF
)"
```

---

### Task 7: `/rides/[id]/page.tsx` — sahiplik koruması, poster gösterimi, `OfferButton`

**Files:**
- Create: `src/features/bookings/OfferButton.tsx`
- Modify: `src/app/rides/[id]/page.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: Task 3'ün `createOffer`/`getMyOfferForRide`, Task 6'nın `ride.poster`.
- Produces: `OfferButton({ rideId, existingOffer }: { rideId: string; existingOffer: Booking | null })`.

**Not:** Bu sayfada bugüne kadar `canBook`/`showLoginPrompt`/`showVerifyPrompt`/`showWaitlist` sadece `ride.driver_id`'ye karşı kontrol ediyordu — bir yolcu ilanında onay öncesi `driver_id` NULL olduğundan, ilan sahibi (yolcu) KENDİ ilanını görüntülediğinde bu kontroller onu "sahip değil" sayıp ona rezervasyon/teklif CTA'sı gösterirdi (gerçek bir bug, bu task'ta düzeltiliyor: `posted_by`'a karşı da kontrol ekleniyor).

- [ ] **Step 1: i18n anahtarı gerekmiyor**

Task 3/5'in eklediği `Bookings.actions.makeOffer`/`manageOffer`/`Bookings.success.offerCreated` zaten yeterli — bu task'ta yeni anahtar yok.

- [ ] **Step 2: `src/features/bookings/OfferButton.tsx`'i oluştur**

```tsx
"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { createOffer } from "@/features/bookings/actions"
import type { Booking } from "@/types/booking"

// createOffer'ın karşılığı — BookingButton'ın "ters" versiyonu. Koltuk
// sayısı sorulmaz (bir yolcu ilanı her zaman tam ride.seat_count kadar tek
// bir sürücü tarafından karşılanır). Reddedilmiş bir teklif tekrar teklif
// vermeyi engellemez (Task 2'nin unique index'i sadece pending/approved'ı
// kapsıyor) — bu yüzden yalnızca "rejected DEĞİL" bir teklif varken durum
// gösterilir, aksi halde yeniden teklif formu gösterilir.
export function OfferButton({ rideId, existingOffer }: { rideId: string; existingOffer: Booking | null }) {
  const t = useTranslations("Bookings")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (existingOffer && existingOffer.status !== "rejected") {
    return (
      <div className="flex items-center gap-3">
        <BookingStatusBadge status={existingOffer.status} />
        {existingOffer.status === "pending" && <CancelBookingButton bookingId={existingOffer.id} rideId={rideId} />}
        {existingOffer.status === "approved" && (
          <Link href={`/rides/${rideId}/bookings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("actions.manageOffer")}
          </Link>
        )}
      </div>
    )
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await createOffer(rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("offerCreated"))
        router.refresh()
      }
    })
  }

  return (
    <Button onClick={onSubmit} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
      {t("actions.makeOffer")}
    </Button>
  )
}
```

- [ ] **Step 3: `src/app/rides/[id]/page.tsx`'i yeniden yaz**

```tsx
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowRight, CalendarDays, Cigarette, Clock, Crown, LogIn, MapPin, PawPrint, Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { RideStatusBadge } from "@/features/rides/RideStatusBadge"
import { getDriverCompletedRideCount, getRideWithDriver } from "@/features/rides/queries"
import { getProfile, isPhoneVerified } from "@/features/profile/queries"
import { getMyBookingForRide, getMyOfferForRide, getRideDriverPaymentInfo } from "@/features/bookings/queries"
import { BookingButton } from "@/features/bookings/BookingButton"
import { OfferButton } from "@/features/bookings/OfferButton"
import { ReviewSection } from "@/features/reviews/ReviewSection"
import { getReviewStats } from "@/features/reviews/queries"
import { StarRating } from "@/features/reviews/StarRating"
import { getMyWaitlistEntry } from "@/features/waitlist/queries"
import { WaitlistButton } from "@/features/waitlist/WaitlistButton"
import { formatCostShare } from "@/utils/currency"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"
import { languageAlternates } from "@/i18n/hreflang"
import { getCurrentUser } from "@/lib/supabase/dal"

// Trailing slash is stripped so `${SITE_URL}/path` below never produces `//`
// regardless of how NEXT_PUBLIC_SITE_URL is set in the deployment environment.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const ride = await getRideWithDriver(id)
  if (!ride) {
    return {}
  }

  const t = await getTranslations("RideDetailPage")
  const format = await getFormatter()
  const locale = await getUserLocale()
  const departureAt = new Date(ride.departure_time)
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)

  const departureLabel = ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity
  const arrivalLabel = ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity
  // Brand suffix is not appended here — the root layout's title template
  // ("%s | GötürBeni") already adds it, so appending it here would double it up.
  const title = `${departureLabel} → ${arrivalLabel}`
  const description = t("metaDescription", {
    date: format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" }),
    cost: formatCostShare(ride.cost_share, locale),
  })

  return {
    title,
    description,
    openGraph: { title: `${title} | GötürBeni`, description },
    twitter: { title: `${title} | GötürBeni`, description },
    alternates: { canonical: `/rides/${id}`, languages: languageAlternates(`/rides/${id}`) },
  }
}

export default async function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ride = await getRideWithDriver(id)
  if (!ride) {
    notFound()
  }

  const [t, tCard, tNav, tReviews, tBookings, format, locale, user] = await Promise.all([
    getTranslations("RideDetailPage"),
    getTranslations("Rides.card"),
    getTranslations("Nav"),
    getTranslations("Reviews"),
    getTranslations("Bookings.loginPrompt"),
    getFormatter(),
    getUserLocale(),
    getCurrentUser(),
  ])

  const isPassengerListing = ride.posted_by_role === "passenger"
  // Yolcu ilanında "profil kartı" ilan sahibini (poster) gösterir, henüz
  // atanmamış bir sürücüyü değil — driver_id onay anına kadar NULL (Faz 2A).
  const posterProfile = isPassengerListing ? await getProfile(ride.posted_by) : null
  const [driverProfile, driverReviewStats] = ride.driver_id
    ? await Promise.all([getProfile(ride.driver_id), getReviewStats(ride.driver_id)])
    : [null, { averageRating: null, reviewCount: 0 }]
  const [existingBooking, existingOffer, userVerified] = user
    ? await Promise.all([
        isPassengerListing ? Promise.resolve(null) : getMyBookingForRide(ride.id, user.id),
        isPassengerListing ? getMyOfferForRide(ride.id, user.id) : Promise.resolve(null),
        isPhoneVerified(user.id),
      ])
    : [null, null, false]
  const awaitingDeposit = existingBooking?.status === "pending" && existingBooking.payment_status === "awaiting_deposit"
  const [driverPaymentInfo, driverCompletedRideCount] = awaitingDeposit && ride.driver_id
    ? await Promise.all([getRideDriverPaymentInfo(ride.id), getDriverCompletedRideCount(ride.driver_id)])
    : [null, 0]
  // Shown next to the IBAN so the passenger has a trust signal at the exact
  // moment they're about to send real money — a fresh, reviewless account
  // asking for a deposit is the actual "post a fake ride, collect, vanish"
  // fraud pattern; an IBAN checksum wouldn't catch that (see conversation).
  const driverTrustInfo = awaitingDeposit
    ? {
        memberSinceIso: driverProfile?.created_at ?? ride.created_at,
        completedRideCount: driverCompletedRideCount,
        averageRating: driverReviewStats.averageRating,
        reviewCount: driverReviewStats.reviewCount,
      }
    : null

  const departureAt = new Date(ride.departure_time)
  const posterName = isPassengerListing
    ? (ride.poster?.full_name ?? tCard("unknownPoster"))
    : (ride.driver?.full_name ?? tCard("unknownDriver"))
  const posterInitials = posterName.slice(0, 2).toUpperCase()
  const isOwnListing = user ? user.id === ride.posted_by : false
  const isActiveForBooking = ride.status === "active"
  // "Sahip" artık posted_by — sürücü ilanında posted_by=driver_id olduğundan
  // davranış aynı; yolcu ilanında ilan sahibi (henüz driver_id olmayan)
  // kendi ilanına rezervasyon/teklif CTA'sı görmemeli (eskiden sadece
  // driver_id kontrol edildiği için bu bir bug'dı, bkz. Task açıklaması).
  const canBook = user && !isOwnListing && !isPassengerListing && isActiveForBooking && userVerified
  const canOffer = user && !isOwnListing && isPassengerListing && isActiveForBooking && userVerified
  // Guests can view every ride, but only a signed-in, non-owner, phone-
  // verified user can book it — show a CTA instead of hiding the footer
  // outright, so the visitor understands why there's no "reserve" button.
  const showLoginPrompt = !user && isActiveForBooking
  const showVerifyPrompt = user && !isOwnListing && isActiveForBooking && !userVerified
  // A full ride can't take a new booking at all (createBooking hard-rejects
  // non-"active" rides) — offer the waitlist instead of just a dead end.
  // Bir yolcu ilanı tek bir teklifle TAMAMEN kapandığından (kısmi kabul
  // yok) "koltuk açılması" hiç olmaz — bekleme listesi sadece sürücü
  // ilanlarında anlamlı.
  const showWaitlist = user && !isOwnListing && !isPassengerListing && ride.status === "full" && !existingBooking
  const myWaitlistEntry = showWaitlist ? await getMyWaitlistEntry(ride.id, user.id) : null
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)
  const routeLabel = `${departureCity} → ${arrivalCity}`

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tNav("home"), item: SITE_URL },
      { "@type": "ListItem", position: 2, name: tNav("rides"), item: `${SITE_URL}/rides` },
      { "@type": "ListItem", position: 3, name: routeLabel, item: `${SITE_URL}/rides/${id}` },
    ],
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }} />
      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MapPin className="text-muted-foreground size-5" aria-hidden="true" />
            {ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity}
            <ArrowRight className="text-muted-foreground size-5 rtl:-scale-x-100" aria-hidden="true" />
            {ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity}
          </h1>
          <div className="flex items-center gap-2">
            {ride.vip_solo && (
              <Badge variant="secondary" className="gap-1">
                <Crown className="size-3" aria-hidden="true" /> {tCard("vipSolo")}
              </Badge>
            )}
            <RideStatusBadge status={ride.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={(isPassengerListing ? ride.poster?.avatar_url : ride.driver?.avatar_url) ?? undefined} alt={posterName} />
              <AvatarFallback>{posterInitials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{posterName}</p>
                {!isPassengerListing && driverReviewStats.averageRating !== null && (
                  <div className="flex items-center gap-1">
                    <StarRating rating={driverReviewStats.averageRating} size="sm" />
                    <span className="text-muted-foreground text-xs">({driverReviewStats.reviewCount})</span>
                  </div>
                )}
              </div>
              {!isPassengerListing && (ride.driver?.car_brand || ride.driver?.car_model || ride.driver?.car_plate) && (
                <p className="text-muted-foreground text-sm">
                  {[
                    [ride.driver?.car_brand, ride.driver?.car_model].filter(Boolean).join(" "),
                    ride.driver?.car_plate,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {(isPassengerListing ? posterProfile?.bio : driverProfile?.bio) && (
                <p className="text-muted-foreground text-sm">{isPassengerListing ? posterProfile?.bio : driverProfile?.bio}</p>
              )}
            </div>
          </div>

          {(ride.pets_allowed || ride.smoking_allowed) && (
            <div className="flex flex-wrap gap-1.5">
              {ride.pets_allowed && (
                <Badge variant="outline" className="gap-1">
                  <PawPrint className="size-3" aria-hidden="true" /> {tCard("petsAllowed")}
                </Badge>
              )}
              {ride.smoking_allowed && (
                <Badge variant="outline" className="gap-1">
                  <Cigarette className="size-3" aria-hidden="true" /> {tCard("smokingAllowed")}
                </Badge>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
              {format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground size-4" aria-hidden="true" />
              {format.dateTime(departureAt, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-4" aria-hidden="true" />
              {t("seats", { available: ride.available_seats, total: ride.seat_count })}
            </div>
            <div className="font-medium">{formatCostShare(ride.cost_share, locale)}</div>
          </div>

          {ride.description && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t("descriptionLabel")}</h2>
              <p className="text-muted-foreground text-sm">{ride.description}</p>
            </div>
          )}

          {!isPassengerListing && driverReviewStats.reviewCount > 0 && ride.driver_id && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{tReviews("recentReviews")}</h2>
              <ReviewSection userId={ride.driver_id} limit={3} hideStats />
            </div>
          )}
        </CardContent>
        {canBook && (
          <CardFooter>
            <BookingButton
              rideId={ride.id}
              availableSeats={ride.available_seats}
              existingBooking={existingBooking}
              driverPaymentInfo={driverPaymentInfo}
              driverTrustInfo={driverTrustInfo}
            />
          </CardFooter>
        )}
        {canOffer && (
          <CardFooter>
            <OfferButton rideId={ride.id} existingOffer={existingOffer} />
          </CardFooter>
        )}
        {showLoginPrompt && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{tBookings("message")}</p>
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              <LogIn className="size-4" aria-hidden="true" /> {tBookings("cta")}
            </Link>
          </CardFooter>
        )}
        {showVerifyPrompt && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{tBookings("verifyMessage")}</p>
            <Link href="/verify-phone" className={buttonVariants({ size: "sm" })}>
              <LogIn className="size-4" aria-hidden="true" /> {tBookings("verifyCta")}
            </Link>
          </CardFooter>
        )}
        {showWaitlist && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{t("waitlistMessage")}</p>
            <WaitlistButton rideId={ride.id} initiallyJoined={myWaitlistEntry !== null} />
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 5: Commit**

```bash
git add src/features/bookings/OfferButton.tsx src/app/rides/[id]/page.tsx
git commit -m "$(cat <<'EOF'
rides/[id]: OfferButton + sahiplik kontrolünü posted_by'a genişlet

canBook/canOffer/showVerifyPrompt/showWaitlist artık posted_by'a karşı
da kontrol ediyor — eskiden sadece driver_id kontrol edildiği için bir
yolcu ilan sahibi kendi ilanında yanlışlıkla rezervasyon/teklif CTA'sı
görüyordu. Profil kartı artık yolcu ilanında poster'ı, sürücü
ilanında driver'ı gösteriyor.
EOF
)"
```

---

### Task 8: `/rides/[id]/bookings/page.tsx` — çift-rollü karşı taraf çözümü, teklif onay metni

**Files:**
- Modify: `src/features/bookings/BookingActions.tsx`
- Modify: `src/app/rides/[id]/bookings/page.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: Task 1'in `BookingWithPassenger.driver`.
- Produces: `BookingActions({ bookingId, rideId, isOffer? })`.

**Not:** Bu sayfa Faz 2A'dan beri zaten `ride.posted_by !== user.id` kontrolü yapıyor (ilan sahibi erişebiliyor) — ama teklif veren (ve onayından sonra `ride.driver_id` olan) sürücünün BU sayfaya erişimi yoktu (chat/pickup/settle/no-show/review araçları için başka hiçbir yer de yok). Bu task ikisini birden çözüyor: (1) sahiplik kontrolü, ilan sahibi OLMAYAN ama onaylanmış teklifiyle `ride.driver_id` olan kullanıcıyı da kabul edecek şekilde genişliyor — o durumda sadece KENDİ satırı görünüyor; (2) her satırın "karşı taraf"ı artık `booking.passenger_id`'ye değil, izleyenin kim olduğuna göre hesaplanıyor.

- [ ] **Step 1: i18n anahtarlarını ekle — `messages/tr.json`**

`Bookings.card` içine, `unknownPassenger`'ın hemen altına:

```json
    "unknownDriver": "Sürücü",
```

- [ ] **Step 2: `messages/en.json`/`messages/ar.json`'a aynı konumda ekle**

en:
```json
    "unknownDriver": "Driver",
```

ar:
```json
    "unknownDriver": "السائق",
```

- [ ] **Step 3: `BookingActions.tsx`'e `isOffer` prop'u ekle**

```tsx
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { approveBooking, rejectBooking } from "@/features/bookings/actions"

type PendingAction = "approve" | "reject" | null

// isOffer: bu satır bir yolcu ilanına verilen sürücü teklifiyse (booker_role
// ='driver') true — "Kaporayı Aldım, Onayla" (depozito zaten alınmış
// anlamına gelir) burada YANLIŞ olur, çünkü onay burada depozito ÖNCESİ
// gerçekleşir (bkz. supabase/migrations/0061_passenger_listing_offer_fixes.sql).
export function BookingActions({ bookingId, rideId, isOffer = false }: { bookingId: string; rideId: string; isOffer?: boolean }) {
  const t = useTranslations("Bookings.actions")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<PendingAction>(null)

  function runAction(action: PendingAction) {
    if (confirming !== action) {
      setConfirming(action)
      return
    }
    startTransition(async () => {
      const result = action === "approve" ? await approveBooking(bookingId, rideId) : await rejectBooking(bookingId, rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(action === "approve" ? tSuccess(isOffer ? "offerApproved" : "approved") : tSuccess("rejected"))
        router.refresh()
      }
      setConfirming(null)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={confirming === "approve" ? "default" : "outline"}
        onClick={() => runAction("approve")}
        disabled={isPending}
      >
        {isPending && confirming === "approve" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        {confirming === "approve" ? t(isOffer ? "confirmApproveOffer" : "confirmApprove") : t(isOffer ? "approveOffer" : "approve")}
      </Button>
      <Button
        size="sm"
        variant={confirming === "reject" ? "destructive" : "outline"}
        onClick={() => runAction("reject")}
        disabled={isPending}
      >
        {isPending && confirming === "reject" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <X className="size-4" aria-hidden="true" />
        )}
        {confirming === "reject" ? t("confirmReject") : t("reject")}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: `src/app/rides/[id]/bookings/page.tsx`'i yeniden yaz**

```tsx
import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MessageCircle, Phone, Users } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { BookingActions } from "@/features/bookings/BookingActions"
import { RefundProofUpload } from "@/features/bookings/RefundProofUpload"
import { ReportNoShowButton } from "@/features/bookings/ReportNoShowButton"
import { SettlePaymentButton } from "@/features/bookings/SettlePaymentButton"
import { OpenDisputeButton } from "@/features/disputes/OpenDisputeButton"
import { getMyDisputeForBooking } from "@/features/disputes/queries"
import { VerifyPickupCodeForm } from "@/features/pickup/VerifyPickupCodeForm"
import { getPickupVerificationStatus } from "@/features/pickup/queries"
import { getRide } from "@/features/rides/queries"
import { getRideBookings, getRideCounterpartyPhone } from "@/features/bookings/queries"
import { ShareLocationToggle } from "@/features/live-location/ShareLocationToggle"
import { getRideWaitlistCount } from "@/features/waitlist/queries"
import { getUnreadMessages } from "@/features/chat/queries"
import { ReviewButton } from "@/features/reviews/ReviewButton"
import { getMyReviewForRide } from "@/features/reviews/queries"
import { verifySession } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RideBookingsPage")
  return { title: t("title") }
}

export default async function RideBookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifySession()
  const ride = await getRide(id)

  const isOwner = !!ride && ride.posted_by === user.id
  // Bir yolcu ilanına teklifi onaylanmış sürücü, ilan sahibi olmasa da bu
  // sayfaya erişebilmeli — chat/pickup/settle/no-show/review araçları
  // başka hiçbir yerde yok (bkz. Task açıklaması). ride.driver_id onay
  // öncesi NULL olduğundan bu sadece onay SONRASI erişim verir.
  const isFulfillingDriver = !!ride && !isOwner && ride.driver_id === user.id
  if (!ride || (!isOwner && !isFulfillingDriver)) {
    notFound()
  }

  const t = await getTranslations("RideBookingsPage")
  const tCard = await getTranslations("Bookings.card")
  const tReviewActions = await getTranslations("Reviews.actions")
  const tBookingActions = await getTranslations("Bookings.actions")
  const [allBookings, unreadMessages, waitlistCount] = await Promise.all([
    getRideBookings(id),
    getUnreadMessages(user.id),
    ride.status === "full" ? getRideWaitlistCount(id) : Promise.resolve(0),
  ])
  // İlan sahibi TÜM teklifleri/talepleri görür (onaylama/reddetme için).
  // Teklifi onaylanmış sürücü sadece KENDİ satırını görür — diğer
  // (rakip) sürücülerin bekleyen/reddedilen tekliflerini görmemeli.
  const bookings = isOwner ? allBookings : allBookings.filter((booking) => booking.driver_id === user.id)
  const isRideOver = new Date(ride.departure_time) < new Date()
  const approvedBookings = bookings.filter((booking) => booking.status === "approved")
  // Karşı taraf: eğer BEN bu satırın teklif veren sürücüyüyüm, karşı taraf
  // ilan sahibi (passenger_id); değilsem (ilan sahibiyim) karşı taraf ya
  // teklif veren sürücü (driver_id, yolcu ilanında) ya da rezervasyon
  // talebindeki yolcu (passenger_id, sürücü ilanında — driver_id o
  // durumda hep NULL).
  function counterpartyOf(booking: (typeof bookings)[number]) {
    const viewerIsOfferingDriver = booking.driver_id === user.id
    const id = viewerIsOfferingDriver ? booking.passenger_id : (booking.driver_id ?? booking.passenger_id)
    const profile = viewerIsOfferingDriver ? booking.passenger : (booking.driver ?? booking.passenger)
    const fallbackLabel = viewerIsOfferingDriver || !booking.driver_id ? tCard("unknownPassenger") : tCard("unknownDriver")
    return { id, name: profile?.full_name ?? fallbackLabel, avatarUrl: profile?.avatar_url ?? null }
  }
  const myReviews = isRideOver
    ? await Promise.all(approvedBookings.map((booking) => getMyReviewForRide(id, user.id, counterpartyOf(booking).id)))
    : []
  const reviewedCounterpartyIds = new Set(
    approvedBookings.filter((_, index) => myReviews[index]).map((booking) => counterpartyOf(booking).id)
  )
  const counterpartyPhones = new Map(
    await Promise.all(
      approvedBookings.map(async (booking) => [booking.id, await getRideCounterpartyPhone(id, counterpartyOf(booking).id)] as const)
    )
  )
  const myDisputes = new Map(
    await Promise.all(approvedBookings.map(async (booking) => [booking.id, await getMyDisputeForBooking(booking.id, user.id)] as const))
  )
  const pickupVerified = new Map(
    await Promise.all(approvedBookings.map(async (booking) => [booking.id, await getPickupVerificationStatus(booking.id)] as const))
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        {approvedBookings.length > 0 && !isRideOver && <ShareLocationToggle rideId={id} />}
      </div>

      {isOwner && waitlistCount > 0 && <p className="text-muted-foreground mb-6 text-sm">{t("waitlistCount", { count: waitlistCount })}</p>}

      {bookings.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map((booking) => {
            const counterparty = counterpartyOf(booking)
            const counterpartyInitials = counterparty.name.slice(0, 2).toUpperCase()
            const isApproved = booking.status === "approved"
            const alreadyReviewed = reviewedCounterpartyIds.has(counterparty.id)
            const counterpartyPhone = counterpartyPhones.get(booking.id)
            // Sadece ilan sahibi onaylar/reddeder — teklifi onaylanmış sürücü
            // için bu satır zaten her zaman 'approved' (bkz. yukarıdaki
            // bookings filtresi), yani bu hiç tetiklenmez, ama netlik için
            // isOwner'a bağlı bırakılıyor.
            const isOffer = ride.posted_by_role === "passenger"
            // "Kimin karşı tarafı raporlaması gerekiyor" — normal akışta ben
            // (ilan sahibi=sürücü) yolcuyu raporlarım; yolcu ilanında ben
            // (ilan sahibi=yolcu) sürücüyü raporlarım, teklifi onaylanmış
            // sürücü ise yolcuyu raporlar.
            const viewerReportsDriver = isOwner && isOffer
            const alreadyReportedNoShow = viewerReportsDriver ? booking.driver_no_show : booking.passenger_no_show
            const noShowLabel = viewerReportsDriver ? tBookingActions("reportDriverNoShow") : tBookingActions("reportPassengerNoShow")
            // Karşılıklı "Kalan Ödeme Tamamlandı" onayı — confirmRemainingPayment
            // RPC'si auth.uid()'in hangi taraf olduğunu kendi belirliyor, burada
            // sadece HANGİ flag'in (driver_settled_at/passenger_settled_at)
            // izleyene ait olduğu seçiliyor.
            const viewerIsDriverSide = isOwner ? ride.posted_by_role === "driver" : true
            const viewerSettled = viewerIsDriverSide ? booking.driver_settled_at : booking.passenger_settled_at

            return (
              <Card key={booking.id}>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={counterparty.avatarUrl ?? undefined} alt={counterparty.name} />
                      <AvatarFallback>{counterpartyInitials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{counterparty.name}</p>
                      <p className="text-muted-foreground text-sm">{tCard("seatCount", { count: booking.seat_count })}</p>
                      {isApproved && counterpartyPhone && (
                        <a href={`tel:${counterpartyPhone}`} className="text-primary flex items-center gap-1 text-sm hover:underline">
                          <Phone className="size-3.5" aria-hidden="true" /> {counterpartyPhone}
                        </a>
                      )}
                    </div>
                  </div>
                  {isOwner && booking.status === "pending" ? (
                    <BookingActions bookingId={booking.id} rideId={id} isOffer={isOffer} />
                  ) : (
                    <BookingStatusBadge status={booking.status} />
                  )}
                </CardContent>
                {booking.refund_status !== "not_applicable" && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <RefundProofUpload
                      bookingId={booking.id}
                      rideId={id}
                      refundStatus={booking.refund_status}
                      rejectReason={booking.refund_reject_reason}
                    />
                  </CardFooter>
                )}
                {isApproved && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/rides/${id}/chat?passengerId=${counterparty.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "relative" })}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                      {t("chat")}
                      {unreadMessages.threadKeys.has(`${id}:${counterparty.id}`) && (
                        <span className="bg-destructive ring-background absolute -end-1 -top-1 size-2.5 rounded-full ring-2" aria-hidden="true" />
                      )}
                    </Link>
                    <VerifyPickupCodeForm bookingId={booking.id} rideId={id} alreadyVerified={pickupVerified.get(booking.id) ?? false} />
                    {isRideOver && booking.payment_status === "deposit_confirmed" && !viewerSettled && (
                      <SettlePaymentButton bookingId={booking.id} rideId={id} />
                    )}
                    {isRideOver &&
                      (alreadyReviewed ? (
                        <Badge variant="secondary">{tReviewActions("alreadyReviewed")}</Badge>
                      ) : (
                        <ReviewButton rideId={id} revieweeId={counterparty.id} />
                      ))}
                    {isRideOver &&
                      (alreadyReportedNoShow ? (
                        <Badge variant="secondary">{tBookingActions("alreadyReportedNoShow")}</Badge>
                      ) : (
                        <ReportNoShowButton bookingId={booking.id} rideId={id} label={noShowLabel} />
                      ))}
                    <OpenDisputeButton bookingId={booking.id} alreadyOpen={!!myDisputes.get(booking.id)} />
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 6: Dev server'da elle doğrula (mümkünse iki farklı hesapla)**

Bir sürücü ilanında: ilan sahibi olmayan biri `/rides/[id]/bookings`'e gidince 404 aldığını doğrula (davranış aynı kalmalı). Gerçek bir Supabase örneği yoksa bu adımı atla, sadece kod okuması ile doğrula.

- [ ] **Step 7: Commit**

```bash
git add src/features/bookings/BookingActions.tsx src/app/rides/[id]/bookings/page.tsx messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
rides/[id]/bookings: teklifi onaylanmış sürücüye erişim + çift-rollü karşı taraf

Sayfa artık ride.posted_by VEYA ride.driver_id (onay sonrası) ile
erişilebiliyor — teklifi onaylanmış sürücü için chat/pickup/settle/
no-show/review araçlarının tek yeri burasıydı ama erişimi yoktu.
Karşı taraf artık booking.passenger_id sabitine değil, izleyenin kim
olduğuna göre hesaplanıyor. BookingActions'a isOffer prop'u eklendi
(depozito öncesi onay için "Teklifi Kabul Et" metni, "Kaporayı Aldım"
değil — Task 2'nin depozito sırası düzeltmesiyle tutarlı).
EOF
)"
```

---

### Task 9: `/bookings` sayfası — "Verdiğim Teklifler" bölümü + onay-sonrası depozito ekranı

**Files:**
- Modify: `src/app/bookings/page.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json`

**Interfaces:**
- Consumes: Task 3'ün `getMyDriverOffers`, Task 2'nin depozito-sırası düzeltmesi.

**Not:** Task 2, `booker_role='driver'` onaylarında `payment_status`'u `'deposit_confirmed'`'a ZORLAMAMAYI seçti (varsayılan `'awaiting_deposit'` kalıyor) — bu, `status='approved' && payment_status='awaiting_deposit'` kombinasyonunu (normal akışta hiç oluşmayan) ilk kez mümkün kılıyor. Bu sayfa, o kombinasyonu gördüğünde depozito ödeme talimatlarını (IBAN + dekont yükleme) gösteriyor — `BookingButton.tsx`'in `awaitingDeposit` gösterimiyle aynı fikir, ama oraya `status==='pending'` şartıyla bağlı olduğu için buraya taşınamaz, aynı deseni burada tekrarlıyoruz.

- [ ] **Step 1: i18n anahtarlarını ekle — `messages/tr.json`**

`BookingsPage` içine, `chat`'in hemen altına:

```json
  "myOffersTitle": "Verdiğim Teklifler"
```

(Dikkat: `chat` satırından sonra virgül eklemeyi unutma.)

- [ ] **Step 2: `messages/en.json`/`messages/ar.json`'a aynı konumda ekle**

en:
```json
  "myOffersTitle": "My Offers"
```

ar:
```json
  "myOffersTitle": "العروض التي قدمتها"
```

- [ ] **Step 3: `src/app/bookings/page.tsx`'i güncelle**

Import listesini güncelle — `getMyBookings`/`getRideCounterpartyPhone` içeren satırı bul ve `getMyDriverOffers`/`getRideDriverPaymentInfo` ekle:

```ts
import { getMyBookings, getMyDriverOffers, getRideCounterpartyPhone, getRideDriverPaymentInfo } from "@/features/bookings/queries"
```

Yeni üç import ekle:

```ts
import { ReceiptUploadForm } from "@/features/bookings/ReceiptUploadForm"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { submitDepositReceipt } from "@/features/bookings/actions"
```

`BookingsPage` fonksiyonunun içinde, `const [bookings, unreadMessages] = ...` satırının hemen altına:

```ts
  const myOffers = await getMyDriverOffers(user.id)
  // Task 2'nin depozito-sırası düzeltmesiyle mümkün olan tek yeni durum:
  // teklifim onaylandı ama henüz depozito ödemedim (payment_status hâlâ
  // 'awaiting_deposit' — normal rezervasyonlarda approved olmak zaten
  // deposit_confirmed anlamına geldiğinden bu satır normalde asla
  // oluşmaz). Sadece bu durumdaki, kendi (yolcu olarak) rezervasyonlarım
  // için IBAN'a ihtiyaç var, tek tek çekiliyor.
  const awaitingOfferDeposits = bookings.filter((booking) => booking.status === "approved" && booking.payment_status === "awaiting_deposit")
  const offerDepositPaymentInfo = new Map(
    await Promise.all(
      awaitingOfferDeposits.map(async (booking) => [booking.id, await getRideDriverPaymentInfo(booking.ride.id)] as const)
    )
  )
```

Sayfanın return JSX'inin, mevcut `bookings.length === 0 ? ... : (...)` bloğunun HEMEN ALTINA (ana `<div>` kapanmadan önce), yeni bir bölüm ekle:

```tsx
      {myOffers.length > 0 && (
        <div className="mt-10 flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t("myOffersTitle")}</h2>
          {myOffers.map((offer) => (
            <Card key={offer.id}>
              <CardHeader className="flex items-center justify-between gap-4">
                <Link href={`/rides/${offer.ride.id}`} className="font-semibold hover:underline">
                  {getProvinceDisplayName(offer.ride.departure_city, locale)} → {getProvinceDisplayName(offer.ride.arrival_city, locale)}
                </Link>
                <BookingStatusBadge status={offer.status} />
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>{format.dateTime(new Date(offer.ride.departure_time), { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                <div className="font-medium">{formatCostShare(offer.ride.cost_share, locale)}</div>
              </CardContent>
              <CardFooter className="flex flex-wrap items-center gap-2">
                {offer.status === "pending" && <CancelBookingButton bookingId={offer.id} rideId={offer.ride.id} />}
                {offer.status === "approved" && (
                  <Link href={`/rides/${offer.ride.id}/bookings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {tBookingActions("manageOffer")}
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
```

(`tBookingActions` zaten sayfanın başında `await getTranslations("Bookings.actions")` olarak tanımlı — bkz. mevcut dosya, satır ~39.)

- [ ] **Step 4: Onaylanmış-ama-depozito-bekleyen bölümünü ekle**

Mevcut booking kartlarının render edildiği `.map((booking) => { ... })` bloğunun İÇİNDE, `{(booking.status === "pending" || booking.status === "approved") && (<CardFooter ...>` bloğunun HEMEN ÜSTÜNE (`{booking.status === "approved" && !isCompleted && (<CardFooter> <LiveLocationSection .../> </CardFooter>)}` bloğundan sonra, pickup-code bloğundan önce VEYA sonra — mevcut sıralamayı bozmadan, en doğal yer pickup-code bloğunun hemen altı), yeni bir koşullu blok ekle:

```tsx
                {booking.status === "approved" && booking.payment_status === "awaiting_deposit" && (
                  <CardFooter className="flex flex-col items-start gap-2">
                    {offerDepositPaymentInfo.get(booking.id) && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">{tPayment("ibanLabel")}: </span>
                        <span className="font-mono font-medium">{offerDepositPaymentInfo.get(booking.id)?.iban}</span>
                        <span className="text-muted-foreground"> · {tPayment("ibanHolderLabel")}: </span>
                        {offerDepositPaymentInfo.get(booking.id)?.iban_holder_name}
                      </div>
                    )}
                    {booking.deposit_receipt_status === null || booking.deposit_receipt_status === "rejected" ? (
                      <ReceiptUploadForm
                        action={(formData) => submitDepositReceipt(booking.id, booking.ride.id, formData)}
                        label={tPayment("uploadReceipt")}
                      />
                    ) : (
                      <Badge variant={booking.deposit_receipt_status === "approved" ? "secondary" : "outline"}>
                        {tPayment(`receiptStatus.${booking.deposit_receipt_status}`)}
                      </Badge>
                    )}
                  </CardFooter>
                )}
```

`tPayment` çevirmeni zaten sayfa üstünde tanımlı değilse ekle — dosyanın başındaki `const t = await getTranslations("BookingsPage")` bloğunun yanına:

```ts
  const tPayment = await getTranslations("Bookings.payment")
```

- [ ] **Step 5: `npx tsc --noEmit` ve `npm run lint` çalıştır**

- [ ] **Step 6: Commit**

```bash
git add src/app/bookings/page.tsx messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
/bookings: Verdiğim Teklifler bölümü + onay-sonrası depozito ekranı

Sürücünün verdiği tüm teklifler (bekleyen/onaylı/reddedilmiş) yeni bir
bölümde listeleniyor; bekleyen bir teklif buradan geri çekilebiliyor
(withdraw), onaylı bir teklif yönetim sayfasına (rides/[id]/bookings)
yönlendiriyor. Task 2'nin depozito-sırası düzeltmesiyle artık mümkün
olan approved+awaiting_deposit durumu için IBAN + dekont yükleme
ekranı eklendi (eskiden bu durum hiç UI'a çıkmıyordu — gerçek bug).
EOF
)"
```

---

### Task 10: Unit testler — regresyon + yeni davranış

**Files:**
- Modify: `src/features/rides/actions.test.ts`
- Modify: `src/features/bookings/actions.test.ts`
- Modify: `src/features/rides/filters.test.ts` (Task 6'da zaten eklendi — burada tekrar dokunma)

**Interfaces:**
- Consumes: Task 3/4'ün `createOffer`, yolcu-modu `createRide`.

- [ ] **Step 1: `rides/actions.test.ts`'in `validRideValues` helper'ını güncelle**

`validRideValues` fonksiyonuna `postedByRole: "driver"` varsayılanı ekle:

```ts
function validRideValues(overrides: Partial<RideFormValues> = {}): RideFormValues {
  const { departureDate, departureTime } = futureDateTimeParts(24)
  return {
    postedByRole: "driver",
    departureCity: "Ankara",
    arrivalCity: "İstanbul",
    departureDistrict: undefined,
    arrivalDistrict: undefined,
    departureDate,
    departureTime,
    seatCount: 2,
    costShare: 100,
    description: undefined,
    petsAllowed: false,
    smokingAllowed: false,
    vipSolo: false,
    repeatWeekly: false,
    ...overrides,
  }
}
```

- [ ] **Step 2: Yolcu-modu `createRide` testini ekle**

`describe("createRide", ...)` bloğunun içine, mevcut testin yanına:

```ts
    it("creates a passenger listing with null driver_id and no IBAN/plate check", async () => {
      const insertMock = vi.fn().mockReturnValue({
        select: () => ({ single: async () => ({ data: { id: "ride-1" }, error: null }) }),
      })
      // profiles_private/profiles hiç sorgulanmamalı (IBAN/plaka kontrolü atlanıyor) —
      // fromMock'u sadece "rides" için kur, başka bir table sorgulanırsa boş dön.
      fromMock.mockImplementation((table: string) => {
        if (table === "rides") return { insert: insertMock }
        return {}
      })

      await createRide(validRideValues({ postedByRole: "passenger" }))

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          driver_id: null,
          posted_by_role: "passenger",
          posted_by: FAKE_USER.id,
          pets_allowed: false,
          smoking_allowed: false,
          vip_solo: false,
        })
      )
    })
```

- [ ] **Step 3: Testleri çalıştır**

```bash
npx vitest run src/features/rides/actions.test.ts
```

Beklenen: yeni + var olan testler PASS.

- [ ] **Step 4: `bookings/actions.test.ts`'e `createOffer` testleri ekle**

Dosyanın import satırına `createOffer` ekle:

```ts
import { approveBooking, cancelBooking, confirmRemainingPayment, createBooking, createOffer, rejectBooking, reportNoShow } from "@/features/bookings/actions"
```

`describe("bookings/actions", ...)` içine, `describe("createBooking", ...)` bloğunun hemen altına yeni bir describe ekle:

```ts
  describe("createOffer", () => {
    it("rejects when the ride is not a passenger listing", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "driver" }))

      const result = await createOffer("ride-1")

      expect(result.error).toBe("Bookings.errors.notPassengerListing")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("rejects offering on your own passenger listing", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", posted_by: FAKE_USER.id, driver_id: null }))

      const result = await createOffer("ride-1")

      expect(result.error).toBe("Bookings.errors.ownRide")
      expect(fromMock).not.toHaveBeenCalled()
    })

    it("inserts a driver-role booking with the ride's full seat_count", async () => {
      getRideMock.mockResolvedValue(
        fakeRide({ posted_by_role: "passenger", posted_by: "passenger-1", driver_id: null, seat_count: 3 })
      )
      const insertMock = vi.fn().mockResolvedValue({ error: null })
      fromMock.mockReturnValue({ insert: insertMock })

      const result = await createOffer("ride-1")

      expect(result).toEqual({ success: true })
      expect(insertMock).toHaveBeenCalledWith({
        ride_id: "ride-1",
        passenger_id: "passenger-1",
        booker_role: "driver",
        driver_id: FAKE_USER.id,
        seat_count: 3,
      })
    })

    it("maps a unique-violation to alreadyOffered", async () => {
      getRideMock.mockResolvedValue(fakeRide({ posted_by_role: "passenger", posted_by: "passenger-1", driver_id: null }))
      fromMock.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }) })

      const result = await createOffer("ride-1")

      expect(result.error).toBe("Bookings.errors.alreadyOffered")
    })
  })
```

- [ ] **Step 5: Testleri çalıştır**

```bash
npx vitest run src/features/bookings/actions.test.ts
```

Beklenen: yeni + var olan testler PASS.

- [ ] **Step 6: Tam suite'i çalıştır**

```bash
npm test
```

Beklenen: hepsi PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/rides/actions.test.ts src/features/bookings/actions.test.ts
git commit -m "$(cat <<'EOF'
Yolcu-modu createRide ve createOffer için unit testler

createRide artık postedByRole='passenger' ile driver_id=null,
posted_by_role='passenger' insert ettiğini ve IBAN/plaka
sorgulamadığını kanıtlıyor. createOffer'ın üç ret yolu (yolcu ilanı
değil, kendi ilanın, zaten teklif var) ve başarı yolu (seat_count=
ride.seat_count, booker_role='driver') test ediliyor.
EOF
)"
```

---

### Task 11: e2e — uçtan uca yolcu ilanı akışı

**Files:**
- Modify: `e2e/utils.ts`
- Create: `e2e/passenger-listing.spec.ts`

**Interfaces:**
- Consumes: `signUpAndVerify`, `uniqueEmail`, `selectCombobox`, `clickWithConfirm` (`e2e/utils.ts`, var olan).
- Produces: `createPassengerListing(page, options): Promise<string>` (yeni e2e helper).

**Not:** Bu ortamda çalışan bir local Supabase örneği yok (bkz. Global Constraints) — bu task'ın dosyaları YAZILIR ama `npx playwright test` bu ortamda ÇALIŞTIRILAMAZ. Kod, var olan `e2e/double-booking.spec.ts`/`e2e/utils.ts` desenleriyle satır satır tutarlı olacak şekilde yazılmalı; gerçek doğrulama, bir sonraki local-Supabase'li oturumda yapılmalı.

- [ ] **Step 1: `e2e/utils.ts`'e `createPassengerListing` helper'ı ekle**

`createRide`'ın hemen altına:

```ts
// createRide'ın yolcu-modu versiyonu — IBAN/plaka profile gerekmiyor
// (createRide/actions.ts bu kontrolü passenger modda atlıyor), rol
// toggle'ından "Yolcuyum"a tıklanıyor, pets/smoking/vip alanları form
// tarafından zaten gizlendiği için hiç doldurulmuyor.
export async function createPassengerListing(
  page: Page,
  options: { departureCity: string; arrivalCity: string; minutesAhead: number; seatCount: number; costShare: number }
): Promise<string> {
  await page.goto("/create-ride")
  await page.getByRole("button", { name: "Yolcuyum", exact: true }).click()
  await selectCombobox(page, "departureCity", options.departureCity)
  await selectCombobox(page, "arrivalCity", options.arrivalCity)
  const { date, time } = nearFutureIstanbulDateTime(options.minutesAhead)
  await page.locator("#departureDate").fill(date)
  await page.locator("#departureTime").fill(time)
  await page.locator("#seatCount").fill(String(options.seatCount))
  await page.locator("#costShare").fill(String(options.costShare))
  await page.getByRole("button", { name: "İlanı Yayınla" }).click()
  await page.waitForURL("**/rides/mine")

  const href = await page.getByRole("link", { name: "Rezervasyonlar" }).first().getAttribute("href")
  const match = href?.match(/\/rides\/([^/]+)\/bookings/)
  if (!match) {
    throw new Error(`Could not extract ride id from "Rezervasyonlar" link href: ${href}`)
  }
  return match[1]
}
```

- [ ] **Step 2: `e2e/passenger-listing.spec.ts`'i oluştur**

```ts
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { clickWithConfirm, createPassengerListing, signUpAndVerify, uniqueEmail } from "./utils"

// Uçtan uca ters rezervasyon: yolcu ilanı açar, sürücü teklif verir, yolcu
// teklifi kabul eder, driver_id atanır — ardından normal chat/pickup akışının
// (sürücü ilanındaki ile birebir aynı kod yolu, sadece hangi tarafın hangi
// rolü oynadığı ters) sorunsuz çalıştığını doğrular.
test.describe.serial("passenger listing reverse booking", () => {
  const passengerEmail = uniqueEmail("plpassenger")
  const driverEmail = uniqueEmail("pldriver")

  let passengerContext: BrowserContext
  let driverContext: BrowserContext
  let passengerPage: Page
  let driverPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    passengerContext = await browser.newContext()
    driverContext = await browser.newContext()
    passengerPage = await passengerContext.newPage()
    driverPage = await driverContext.newPage()
  })

  test.afterAll(async () => {
    await passengerContext.close()
    await driverContext.close()
  })

  test("passenger creates a passenger listing", async () => {
    await signUpAndVerify(passengerPage, passengerEmail)

    rideId = await createPassengerListing(passengerPage, {
      departureCity: "Bursa",
      arrivalCity: "Eskişehir",
      minutesAhead: 60,
      seatCount: 2,
      costShare: 80,
    })
  })

  test("driver makes an offer without needing IBAN/plate upfront", async () => {
    await signUpAndVerify(driverPage, driverEmail)

    await driverPage.goto(`/rides/${rideId}`)
    await driverPage.getByRole("button", { name: "Teklif Ver", exact: true }).click()
    await expect(driverPage.getByText("Teklifiniz gönderildi.")).toBeVisible()
  })

  test("passenger cannot approve without the driver's IBAN/plate set", async () => {
    await passengerPage.goto(`/rides/${rideId}/bookings`)
    await clickWithConfirm(passengerPage, "Teklifi Kabul Et", "Teklifi kabul etmek istediğinize emin misiniz?")
    await expect(passengerPage.getByText("Bu teklifi kabul edemezsiniz — teklif veren sürücünün IBAN bilgisi eksik.")).toBeVisible()
  })

  test("driver adds IBAN/plate, passenger approves the offer", async () => {
    await driverPage.goto("/profile")
    await driverPage.locator("#fullName").fill("E2E Teklif Sürücüsü")
    await driverPage.locator("#iban").fill("TR330006100519786457841326")
    await driverPage.locator("#ibanHolderName").fill("E2E Teklif Sürücüsü")
    await driverPage.locator("#carPlate").fill("34 XYZ 789")
    await driverPage.getByRole("button", { name: "Kaydet" }).click()
    await driverPage.getByText("Profil güncellendi.").waitFor()

    await passengerPage.goto(`/rides/${rideId}/bookings`)
    await clickWithConfirm(passengerPage, "Teklifi Kabul Et", "Teklifi kabul etmek istediğinize emin misiniz?")
    await expect(passengerPage.getByText("Teklif kabul edildi.")).toBeVisible()
  })

  test("approval assigns driver_id — passenger sees deposit instructions, driver reaches the ride's management page", async () => {
    // Task 2'nin depozito-sırası düzeltmesi: onay depozitoyu OTOMATİK
    // "alındı" saymıyor — /bookings'te IBAN + dekont yükleme ekranı çıkmalı.
    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("E2E Teklif Sürücüsü")).not.toBeVisible() // sanity: no stray duplicate text
    await expect(passengerPage.getByText("TR330006100519786457841326")).toBeVisible()

    // driver_id artık teklif veren sürücü olduğundan, sürücü ride'ın
    // /bookings yönetim sayfasına (ilan sahibi olmadığı hâlde) erişebilmeli.
    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByText("E2E Teklif Sürücüsü")).not.toBeVisible() // kendi adını değil, karşı tarafı (yolcuyu) görmeli
  })
})
```

- [ ] **Step 3: Kod okuması ile self-review**

Her `getByRole`/`getByText` çağrısının, ilgili task'ta yazılan gerçek buton metni/i18n anahtarıyla birebir eşleştiğini satır satır kontrol et (`"Teklif Ver"` → Task 3'ün `Bookings.actions.makeOffer` = "Teklif Ver"; `"Teklifi Kabul Et"`/`"Teklifi kabul etmek istediğinize emin misiniz?"` → Task 3'ün `approveOffer`/`confirmApproveOffer`; `"Teklifiniz gönderildi."` → Task 3'ün `Bookings.success.offerCreated`; `"Teklif kabul edildi."` → Task 3'ün `offerApproved`; IBAN hata metni → Faz 2A'nın `Bookings.errors.offerDriverIbanRequired`).

- [ ] **Step 4: `npx tsc --noEmit` çalıştır (Playwright dosyaları da tip kontrolüne dahil)**

- [ ] **Step 5: Commit**

```bash
git add e2e/utils.ts e2e/passenger-listing.spec.ts
git commit -m "$(cat <<'EOF'
e2e: uçtan uca yolcu ilanı → sürücü teklifi → onay → depozito akışı

Bu ortamda local Supabase olmadığı için ÇALIŞTIRILAMADI (bkz. plan
Global Constraints) — kod, var olan double-booking.spec.ts/utils.ts
desenleriyle tutarlı yazıldı, gerçek doğrulama sonraki local-Supabase'li
oturumda yapılmalı.
EOF
)"
```

---

### Task 12: Son doğrulama

**Files:** Yok.

- [ ] **Step 1: Tam kontrol seti**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

Beklenen: DÖRDÜ DE temiz — Faz 2A'nın aksine bu planın sonunda kasıtlı bırakılan bir tsc hatası YOK (tüm dokunulan dosyalar tutarlı tipte).

- [ ] **Step 2: `npx playwright test e2e/passenger-listing.spec.ts` ÇALIŞTIRMAYI DENEME**

Bu ortamda local Supabase yok — bu adım atlanır, sadece Task 11'in kod okuması self-review'una güvenilir. Kullanıcıya bunu açıkça raporla.

- [ ] **Step 3: Dev server'da manuel duman testi (mümkünse)**

`npm run dev` ile `/create-ride`'da rol toggle'ının çalıştığını, `/rides`'ta tür filtresinin göründüğünü, bir yolcu ilanı kartının doğru rozet/poster bilgisiyle render edildiğini gözle doğrula (gerçek bir kayıt/onay akışı, Supabase olmadan tamamlanamaz).

- [ ] **Step 4: Kullanıcıya raporla**

Rapor: 4 kontrolün (lint/tsc/test/build) sonucu, e2e'nin neden koşulamadığı, Task 2'de düzeltilen 3 kusurun (embed belirsizliği, teklif uniqueness, depozito sırası) özeti ve bunların Faz 2A'nın hangi commit'lerini etkilediği, kapsam dışı bırakılanlar (repeatWeekly yolcu ilanında yok, OCR otomatik onay yolcu ilanına genişlemedi — sadece "hiç görünmeme" bug'ı düzeldi), sıradaki adım (bir sonraki oturumda gerçek bir local Supabase kurup migration'ları uygulamak ve e2e'yi gerçekten çalıştırmak).

---

## Self-Review Notu (plan yazarı için)

- **Kapsam eşleşmesi:** Faz 2A'nın Task 8'inde bırakılan "Faz 2B" notu (RideForm rol seçimi, RideCard/RideFilters ayrımı, /rides/mine, i18n, e2e) → Task 5/6/10/11. Tasarım dokümanının Faz 2 UI/UX bölümü (satır 67-73) → Task 5 (RideForm), 6 (RideCard/RideFilters), 9 (/rides/mine yerine /bookings'te "Verdiğim Teklifler" — tasarım dokümanının kendi "kontrol edilecek" notuna göre karar verildi: /rides/mine sadece posted_by/ilan-sahipliği içindir, teklif geçmişi /bookings'e ait).
- **Faz 2A'da keşfedilen 3 kusur:** kullanıcıyla netleştirildi (AskUserQuestion), "Faz 2B'nin içine dahil et" seçildi — Task 1 (embed), Task 2 (uniqueness + cancel_booking + depozito sırası), Task 9 (depozito UI'ı).
- **Placeholder taraması:** Her SQL/TS/JSON/TSX bloğu tam kod, gerçek dosya içerikleri okunarak yazıldı (rides/queries.ts, bookings/queries.ts, bookings/actions.ts, RideForm.tsx, RideCard.tsx, RideFilters.tsx, rides/[id]/page.tsx, rides/[id]/bookings/page.tsx, bookings/page.tsx, BookingActions.tsx, tüm migration'lar tek tek grep'lendi).
- **Tip tutarlılığı:** `RideWithDriver.poster`/`BookingWithPassenger.driver` (Task 1) → Task 6/7/8'in tüm kullanım yerleri bunu tüketiyor. `Booking` tipi zaten Faz 2A'dan `booker_role`/`driver_id: string | null` taşıyor, yeni bir alan gerekmedi. `createOffer`'ın döndürdüğü `BookingActionState` var olan tiple aynı.
- **Bilinen sınırlama:** Bu ortamda gerçek Supabase yok — migration'lar deploy edilemedi, e2e koşulamadı. Task 12 bunu açıkça kullanıcıya raporluyor, gizlemiyor.
