# Single Payment at Settlement (Remove Upfront Deposit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the 25%-upfront-deposit stage from the booking payment flow. A passenger no longer pays anything before/at approval — the full fare (100% of `cost_share * seat_count`) is paid in a single transfer using the existing post-trip "settlement" mechanism (manual mutual confirm, receipt upload, OCR auto-match), which currently only covers the remaining 75%.

**Architecture:** The two-stage `awaiting_deposit → deposit_confirmed → settled` payment state machine collapses to `awaiting_settlement → settled`. Booking/offer **approval** becomes a pure accept-the-request action with no payment side effect (it no longer means "driver confirms deposit received"). The existing settlement machinery (`confirm_remaining_payment`, `submit_settlement_receipt(_ocr)`, admin review) becomes the *only* payment step, now checked against the full fare instead of 75% of it. All deposit-only receipt/OCR/admin-review code, the deposit-deadline auto-cancel cron, and the now-dead deposit-only `bookings` columns are removed. This is a single new migration on top of the existing history (migrations are never rewritten) plus TypeScript/UI/i18n/e2e follow-through.

**Tech Stack:** Next.js server actions, Supabase Postgres (plpgsql RPCs, RLS, pg_cron), next-intl (tr/en/ar), Vitest, Playwright.

## Global Constraints

- Never edit a past migration file — only add new ones. This plan adds exactly one: `supabase/migrations/0062_single_payment_at_settlement.sql`.
- `payment_status` enum value rename uses `ALTER TYPE ... RENAME VALUE` (Postgres ≥10) — do not create a new type.
- Every SQL function this plan touches must be redefined with its **full latest body** (the codebase's own established convention — see 0056/0059/0060/0061 headers) since `CREATE OR REPLACE` replaces the whole body, not a diff.
- Turkish is the source-of-truth locale; English and Arabic copy must be updated to the same meaning in the same commit as the Turkish string. For Arabic strings specifically, double-check hamza placement and MSA-vs-dialect correctness word-by-word (not just fluency) — this project has been burned by sloppy Arabic copy before.
- Run `npm run typecheck` (or equivalent `tsc --noEmit`) and `npx vitest run src/features/bookings/actions.test.ts` after every backend/type task; don't move to the next task with a red typecheck.

---

## Task 1: Database migration — collapse the payment state machine

**Files:**
- Create: `supabase/migrations/0062_single_payment_at_settlement.sql`

**Interfaces:**
- Produces: `booking_payment_status` enum values `'awaiting_settlement' | 'deposit_confirmed' (unused, unreachable) | 'settled'`. `deposit_confirmed` cannot be dropped from the enum (Postgres doesn't support removing enum labels) but after this migration no code path ever writes it again, and the backfill UPDATE moves every existing row off of it.
- Produces: `_apply_booking_approval(uuid, uuid, integer, uuid default null)` no longer touches `payment_status`.
- Produces: `submit_settlement_receipt_ocr(uuid, text, numeric[])` expects the **full** fare, not 75% of it.
- Produces: `admin_bulk_approve_receipts(uuid[])` — the `p_kind` parameter is gone (only settlement receipts exist to bulk-approve now). Task 6 updates the TS caller to match this new signature.
- Removes: `submit_deposit_receipt`, `submit_deposit_receipt_ocr`, `admin_review_deposit_receipt`, `cancel_expired_pending_bookings` (+ its pg_cron job `cancel-expired-pending-bookings`).
- Removes columns from `public.bookings`: `deposit_deadline_at`, `deposit_receipt_url`, `deposit_receipt_status`, `deposit_receipt_reviewed_at`, `deposit_receipt_reject_reason`, `deposit_receipt_reject_count`, `deposit_ocr_iban`, `deposit_ocr_amounts`, `deposit_ocr_checked_at`.

- [ ] **Step 1: Write the migration**

```sql
-- Tek ödeme, yolculuk sonunda: %25 ön depozito + %75 kalan ödeme (settlement)
-- iki aşamalı akışı kaldırılıyor. approve_booking artık sürücünün/ilan
-- sahibinin "depozitoyu aldım" beyanı DEĞİL — salt bir rezervasyon/teklif
-- kabulü. Tüm tutar (100%), var olan settlement (yolculuk sonrası
-- dekont/OCR/karşılıklı buton onayı) akışıyla TEK seferde ödenir.
--
-- booking_payment_status enum'unun 'awaiting_deposit' değeri Postgres'in
-- ALTER TYPE ... RENAME VALUE'suyla 'awaiting_settlement'e yeniden
-- adlandırılıyor (aynı slot; semantiği artık "onaylanmış, yolculuk sonrası
-- ödeme bekleniyor" — hem henüz onaylanmamış hem onaylanmış rezervasyonlarda
-- geçerli, insert'teki varsayılan olarak da kullanılıyor).
-- 'deposit_confirmed' enum'da fiziksel olarak kalıyor (Postgres bir enum
-- değerini DROP edemiyor) ama bu migration'dan sonra HİÇBİR kod yolu onu
-- üretmiyor; var olan satırlar aşağıdaki UPDATE ile taşınıyor.
alter type public.booking_payment_status rename value 'awaiting_deposit' to 'awaiting_settlement';

update public.bookings set payment_status = 'awaiting_settlement' where payment_status = 'deposit_confirmed';

alter table public.bookings alter column payment_status set default 'awaiting_settlement';

-- _apply_booking_approval (son hâli 0061_passenger_listing_offer_fixes.sql):
-- onay artık ödemeyle hiç ilgili değil, payment_status insert'teki
-- 'awaiting_settlement' varsayılanında kalıyor — onay sadece status='approved'
-- yazıyor ve koltuğu düşürüyor.
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
    set status = 'approved'
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;

-- submit_settlement_receipt_ocr (son hâli 0056_no_show_tightening_and_deposit_
-- ratio.sql): beklenen tutar artık kalan %75 değil, ücretin TAMAMI.
create or replace function public.submit_settlement_receipt_ocr(p_booking_id uuid, p_iban text, p_amounts numeric[])
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
    set settlement_ocr_iban = nullif(v_ocr_iban, ''),
        settlement_ocr_amounts = p_amounts,
        settlement_ocr_checked_at = now()
    where id = p_booking_id;

  if v_booking.status <> 'approved' or v_booking.payment_status = 'settled' or v_booking.driver_no_show then
    return false;
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;
  if v_ride.departure_time >= now() then
    return false; -- yolculuk henüz tamamlanmadı
  end if;

  select iban into v_driver_iban from public.profiles_private where id = v_ride.driver_id;
  if v_driver_iban is null or v_ocr_iban = '' or v_driver_iban <> v_ocr_iban then
    return false;
  end if;

  v_expected_amount := round(v_ride.cost_share * v_booking.seat_count, 2);
  if not exists (select 1 from unnest(p_amounts) as amt where abs(amt - v_expected_amount) <= 5.00) then
    return false;
  end if;

  select * into v_passenger from public.profiles where id = v_booking.passenger_id;
  v_low_risk := (
    extract(epoch from (now() - v_passenger.created_at)) / 86400 >= 14
    and not public.is_suspended(v_booking.passenger_id)
    and v_booking.settlement_receipt_reject_count = 0
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

  update public.bookings
    set driver_settled_at = coalesce(driver_settled_at, now()),
        passenger_settled_at = coalesce(passenger_settled_at, now()),
        payment_status = 'settled',
        settlement_receipt_status = 'approved',
        settlement_receipt_reviewed_at = now()
    where id = p_booking_id;

  return true;
end;
$$;

-- get_suspicious_accounts_internal (son hâli 0056): repeated_receipt_rejection
-- kuralı artık deposit_receipt_reject_count'u toplamıyor (kolon aşağıda
-- düşürülüyor) — yalnızca settlement_receipt_reject_count.
create or replace function public.get_suspicious_accounts_internal()
returns table (user_id uuid, full_name text, is_suspended boolean, reason public.suspicious_account_reason, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'ride_spam'::public.suspicious_account_reason,
         count(*)::text || ' ilan / son 24 saat'
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  where r.created_at >= now() - interval '24 hours'
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 5

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'high_cancellation_rate'::public.suspicious_account_reason,
         round(100.0 * count(*) filter (where r.status = 'cancelled') / count(*))::text || '% iptal (' || count(*) || ' ilan)'
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 3 and count(*) filter (where r.status = 'cancelled') >= count(*) * 0.5

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'high_rejection_rate'::public.suspicious_account_reason,
         round(100.0 * count(*) filter (where b.status = 'rejected') / count(*))::text || '% red (' || count(*) || ' talep)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 5 and count(*) filter (where b.status = 'rejected') >= count(*) * 0.7

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'booking_spam'::public.suspicious_account_reason,
         count(*)::text || ' rezervasyon talebi / son 7 gün'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.user_id = b.passenger_id
  where b.created_at >= now() - interval '7 days'
  group by b.passenger_id, p.full_name, af.is_suspended
  having count(*) >= 8

  union all

  select distinct r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'new_account_high_value'::public.suspicious_account_reason,
         'Üye: ' || to_char(p.created_at, 'DD.MM.YYYY') || ', ilan: ₺' || r.cost_share::text
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  where p.created_at >= now() - interval '48 hours'
    and r.cost_share >= 300

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_late_cancellation'::public.suspicious_account_reason,
         count(*)::text || ' geç iptal (kalkışa <2 saat kala)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.user_id = b.passenger_id
  where b.status = 'cancelled' and b.cancelled_at is not null
    and r.departure_time - b.cancelled_at < interval '2 hours'
  group by b.passenger_id, p.full_name, af.is_suspended
  having count(*) >= 2

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_passenger_no_show'::public.suspicious_account_reason,
         count(*)::text || ' no-show (yolcu gelmedi)'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.user_id = b.passenger_id
  where b.passenger_no_show
  group by b.passenger_id, p.full_name, af.is_suspended
  having count(*) >= 1

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_driver_no_show'::public.suspicious_account_reason,
         count(*)::text || ' no-show (sürücü gelmedi)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  where b.driver_no_show
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 1

  union all

  select pp.id, p.full_name, coalesce(af.is_suspended, false), 'duplicate_iban'::public.suspicious_account_reason,
         'Aynı IBAN ' || dup.account_count::text || ' hesapta kayıtlı'
  from public.profiles_private pp
  join public.profiles p on p.id = pp.id
  left join public.admin_flags af on af.user_id = pp.id
  join (
    select iban, count(*) as account_count
    from public.profiles_private
    where iban is not null
    group by iban
    having count(*) > 1
  ) dup on dup.iban = pp.iban

  union all

  select d.against_user_id, p.full_name, coalesce(af.is_suspended, false), 'disputed_repeatedly'::public.suspicious_account_reason,
         count(*)::text || ' anlaşmazlıkta şikayet edilen taraf'
  from public.disputes d
  join public.profiles p on p.id = d.against_user_id
  left join public.admin_flags af on af.user_id = d.against_user_id
  where d.status <> 'dismissed'
  group by d.against_user_id, p.full_name, af.is_suspended
  having count(*) >= 2

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'repeated_receipt_rejection'::public.suspicious_account_reason,
         sum(b.settlement_receipt_reject_count)::text || ' reddedilen dekont'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.user_id = b.passenger_id
  group by b.passenger_id, p.full_name, af.is_suspended
  having sum(b.settlement_receipt_reject_count) >= 3

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'repeated_receipt_rejection'::public.suspicious_account_reason,
         sum(b.refund_reject_count)::text || ' reddedilen iade kanıtı'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  group by r.driver_id, p.full_name, af.is_suspended
  having sum(b.refund_reject_count) >= 3;
end;
$$;

-- cancel_ride_with_bookings (son hâli 0060_passenger_listings_final_review_
-- fixes.sql): 'deposit_confirmed' artık hiç üretilmiyor. Refund dalı zaten
-- yalnızca 'settled' bir rezervasyon için anlamlı — bu fonksiyon sadece
-- status in ('active','full') bir ilan için çalışır (kalkış henüz geçmemiş),
-- settlement ise kalkıştan SONRA gerçekleştiğinden bu dal artık pratikte hiç
-- eşleşmez; yine de fail-safe olarak bırakılıyor (silme yerine sağlamlaştırma).
create or replace function public.cancel_ride_with_bookings(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id and posted_by = auth.uid() for update;
  if not found then
    raise exception 'not_authorized';
  end if;
  if v_ride.status not in ('active', 'full') then
    raise exception 'ride_not_cancellable';
  end if;

  update public.rides set status = 'cancelled' where id = p_ride_id;

  update public.bookings
    set status = 'cancelled',
        refund_status = 'pending',
        refund_requested_at = now()
    where ride_id = p_ride_id
      and status = 'approved'
      and payment_status = 'settled';

  update public.bookings
    set status = 'cancelled'
    where ride_id = p_ride_id
      and status in ('pending', 'approved')
      and payment_status = 'awaiting_settlement';
end;
$$;

-- Depozito dekontu/OCR fonksiyonları artık hiç çağrılmıyor (Task 3
-- actions.ts'teki submitDepositReceipt'i kaldırıyor) — imzalarıyla birlikte
-- düşürülüyor.
drop function public.submit_deposit_receipt(uuid, text);
drop function public.submit_deposit_receipt_ocr(uuid, text, numeric[]);
drop function public.admin_review_deposit_receipt(uuid, boolean, text);

-- admin_bulk_approve_receipts (0047_bulk_receipt_review.sql): 'deposit' kind'i
-- imkansız hâle geldiğinden (admin UI'da o bölüm Task 8'de kaldırılıyor)
-- p_kind parametresi tamamen düşürülüyor — tek kalan tür (settlement) için
-- artık ayırt edici bir parametreye gerek yok.
drop function public.admin_bulk_approve_receipts(uuid[], text);

create function public.admin_bulk_approve_receipts(p_booking_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.bookings
    set settlement_receipt_status = 'approved',
        settlement_receipt_reviewed_at = now(),
        settlement_receipt_reject_reason = null
    where id = any (p_booking_ids) and settlement_receipt_status = 'pending';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- deposit_deadline_at'e dayalı otomatik iptal cron'u (0024) artık anlamsız —
-- "yolcu depozitoyu süresinde ödemezse iptal et" mantığıydı, artık onaydan
-- önce ödenecek bir depozito yok.
select cron.unschedule('cancel-expired-pending-bookings');
drop function public.cancel_expired_pending_bookings();

-- Artık hiçbir kod yolu yazmayan/okumayan depozito-özel kolonlar.
alter table public.bookings
  drop column deposit_deadline_at,
  drop column deposit_receipt_url,
  drop column deposit_receipt_status,
  drop column deposit_receipt_reviewed_at,
  drop column deposit_receipt_reject_reason,
  drop column deposit_receipt_reject_count,
  drop column deposit_ocr_iban,
  drop column deposit_ocr_amounts,
  drop column deposit_ocr_checked_at;
```

- [ ] **Step 2: Apply the migration to the local/dev Supabase instance and confirm it runs clean**

Run: `npx supabase db reset` (or your project's normal "apply migrations" command — check `package.json`/README for the exact one this repo uses).
Expected: no errors; `supabase db diff` (or `psql \d bookings`) shows the 9 deposit columns gone and `payment_status`'s default is `awaiting_settlement`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0062_single_payment_at_settlement.sql
git commit -m "db: collapse deposit+settlement into a single post-trip payment"
```

---

## Task 2: `src/types/booking.ts` — match the new schema

**Files:**
- Modify: `src/types/booking.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BookingPaymentStatus = "awaiting_settlement" | "settled"` (drop `"awaiting_deposit"` and `"deposit_confirmed"` — the latter is DB-legacy-only per Task 1 and the app never needs to represent it). `Booking` interface drops the 9 deposit fields dropped in Task 1.

- [ ] **Step 1: Edit the type file**

Change:
```ts
export type BookingPaymentStatus = "awaiting_deposit" | "deposit_confirmed" | "settled"
```
to:
```ts
export type BookingPaymentStatus = "awaiting_settlement" | "settled"
```

Remove these 9 lines from the `Booking` interface:
```ts
  deposit_deadline_at: string
  ...
  deposit_receipt_url: string | null
  deposit_receipt_status: ReceiptStatus | null
  deposit_receipt_reviewed_at: string | null
  deposit_receipt_reject_reason: string | null
  deposit_receipt_reject_count: number
```
(keep `settlement_receipt_url` / `settlement_receipt_status` / etc. — those are unchanged.)

- [ ] **Step 2: Typecheck (will show every call site that still needs fixing — that's the rest of this plan)**

Run: `npx tsc --noEmit`
Expected: a list of errors in `actions.ts`, `queries.ts`, `BookingButton.tsx`, `bookings/page.tsx`, `rides/[id]/page.tsx`, `rides/[id]/bookings/page.tsx`, `admin/queries.ts`, `admin/actions.ts`, `admin/payments/page.tsx` — these are exactly Tasks 3–8 below.

- [ ] **Step 3: Commit**

```bash
git add src/types/booking.ts
git commit -m "types: drop deposit fields from BookingPaymentStatus/Booking"
```

---

## Task 3: `src/features/bookings/actions.ts` and `queries.ts` — remove deposit server actions/queries

**Files:**
- Modify: `src/features/bookings/actions.ts`
- Modify: `src/features/bookings/queries.ts`

**Interfaces:**
- Removes: `submitDepositReceipt` export.
- Produces: `uploadReceiptFile`'s `kind` parameter type narrows from `"deposit" | "refund" | "settlement"` to `"refund" | "settlement"`.
- Removes: `getMyAwaitingDepositOffers` export from `queries.ts`.

- [ ] **Step 1: Remove `submitDepositReceipt` from `actions.ts`**

Delete the entire function (currently lines 354–446, from the `// Passenger uploads proof of the IBAN deposit transfer` comment through its closing `}`):
```ts
// Passenger uploads proof of the IBAN deposit transfer — reviewed by the
// driver informally and, ultimately, by an admin (admin_review_deposit_receipt
// in supabase/migrations/0020_payment_receipts.sql).
export async function submitDepositReceipt(bookingId: string, rideId: string, formData: FormData): Promise<BookingActionState> {
  ...
  return { success: true }
}
```

- [ ] **Step 2: Narrow `uploadReceiptFile`'s `kind` type**

Change:
```ts
async function uploadReceiptFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  kind: "deposit" | "refund" | "settlement",
  file: File
): Promise<{ path: string } | { error: string }> {
```
to:
```ts
async function uploadReceiptFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  kind: "refund" | "settlement",
  file: File
): Promise<{ path: string } | { error: string }> {
```
and update the doc comment above it from "Shared upload helper for both the passenger's deposit receipt and the driver's refund proof" to "Shared upload helper for both the driver's refund proof and the passenger's settlement receipt".

- [ ] **Step 3: Remove `getMyAwaitingDepositOffers` from `queries.ts`**

Delete the function and its preceding comment block (currently lines 136–157, the `// /bookings sayfasının depozito ekranı için` comment through the closing `}`):
```ts
// /bookings sayfasının depozito ekranı için — bir yolcu ilanı sahibinin,
// KABUL ETTİĞİ ama henüz depozito ödemediği teklifleri (...)
export async function getMyAwaitingDepositOffers(passengerId: string): Promise<BookingWithRide[]> {
  ...
  return (data as BookingWithRide[] | null) ?? []
}
```

- [ ] **Step 4: Update the now-stale comment on `getMyBookings`**

In `queries.ts`, the `getMyBookings` doc comment references `getMyAwaitingDepositOffers` (now deleted). Replace the last sentence:
```
// ilan sahibi için /rides/[id]/bookings üzerinden yönetilir (onay/red/chat/
// settle/review/no-show hepsi orada), driver tarafı için getMyDriverOffers
// üzerinden — bu ikisi zaten var. Tek istisna: onaylanmış ama henüz
// depozito ödenmemiş teklif — bkz. getMyAwaitingDepositOffers (bu satırlar
// booker_role='driver' olduğundan aşağıdaki filtreyle burada hiç
// dönmeyecek, /bookings sayfası o durumu ayrı bir sorguyla çekiyor).
```
with:
```
// ilan sahibi için /rides/[id]/bookings üzerinden yönetilir (onay/red/chat/
// settle/review/no-show hepsi orada), driver tarafı için getMyDriverOffers
// üzerinden — bu ikisi zaten var, booker_role='driver' satırları burada hiç
// dönmez.
```

- [ ] **Step 5: Run the existing unit tests (none of them exercise the deleted code, this just proves nothing else broke)**

Run: `npx vitest run src/features/bookings/actions.test.ts`
Expected: PASS, same test count as before (this file never tested `submitDepositReceipt`/`getMyAwaitingDepositOffers`).

- [ ] **Step 6: Commit**

```bash
git add src/features/bookings/actions.ts src/features/bookings/queries.ts
git commit -m "bookings: remove deposit receipt server action and query"
```

---

## Task 4: `BookingButton.tsx` + `rides/[id]/page.tsx` — replace the deposit alert with a post-approval payment-info alert

**Files:**
- Modify: `src/features/bookings/BookingButton.tsx`
- Modify: `src/app/rides/[id]/page.tsx`

**Interfaces:**
- Consumes: `driverPaymentInfo`/`driverTrustInfo` props (unchanged shape), `Booking.payment_status` (now `"awaiting_settlement" | "settled"`).
- Produces: no new exports; `BookingButton`'s existing `DriverTrustInfo` export is unchanged.

**Design decision (context for the implementer):** Previously the IBAN/trust-info alert appeared while the booking was still `pending` (so the passenger could pay the deposit before the driver even approved). There is no more pre-approval payment step, so showing the driver's IBAN to a not-yet-accepted requester serves no purpose and needlessly exposes it earlier than necessary. The alert now appears once the booking is `approved` and stays until `payment_status === "settled"`, telling the passenger they'll pay the full fare to this IBAN after the ride. The upload button is removed from this component entirely — settlement receipt upload already lives on `/bookings` via `SettlementReceiptUpload` (Task 5), so `BookingButton` becomes purely informational.

- [ ] **Step 1: `rides/[id]/page.tsx` — re-gate the `driverPaymentInfo`/`driverTrustInfo` fetch**

Change:
```ts
  const awaitingDeposit = existingBooking?.status === "pending" && existingBooking.payment_status === "awaiting_deposit"
  const [driverPaymentInfo, driverCompletedRideCount] = awaitingDeposit && ride.driver_id
    ? await Promise.all([getRideDriverPaymentInfo(ride.id), getDriverCompletedRideCount(ride.driver_id)])
    : [null, 0]
  // Shown next to the IBAN so the passenger has a trust signal at the exact
  // moment they're about to send real money — a fresh, reviewless account
  // asking for a deposit is the actual "post a fake ride, collect, vanish"
  // fraud pattern; an IBAN checksum wouldn't catch that (see conversation).
  const driverTrustInfo = awaitingDeposit
```
to:
```ts
  const isApprovedAwaitingPayment = existingBooking?.status === "approved" && existingBooking.payment_status !== "settled"
  const [driverPaymentInfo, driverCompletedRideCount] = isApprovedAwaitingPayment && ride.driver_id
    ? await Promise.all([getRideDriverPaymentInfo(ride.id), getDriverCompletedRideCount(ride.driver_id)])
    : [null, 0]
  // Shown next to the IBAN so the passenger has a trust signal alongside the
  // account they'll eventually send real money to — a fresh, reviewless
  // account is the actual "post a fake ride, collect, vanish" fraud pattern;
  // an IBAN checksum wouldn't catch that (see conversation).
  const driverTrustInfo = isApprovedAwaitingPayment
```
(the rest of that ternary body — `? { memberSinceIso: ..., ... } : null` — is unchanged, only the condition it hangs off of changes name/meaning.)

- [ ] **Step 2: `BookingButton.tsx` — replace the `awaitingDeposit` block**

Change the import line:
```ts
import { createBooking, submitDepositReceipt } from "@/features/bookings/actions"
```
to:
```ts
import { createBooking } from "@/features/bookings/actions"
```

Remove the now-unused imports this leaves dangling: `ReceiptUploadForm`, `Badge` (both were only used inside the block being deleted — check after Step 3 whether `Badge` is still referenced elsewhere in the file; if not, remove its import too).

Replace the whole body from `if (existingBooking) {` through its closing `}` (currently lines 50–123) with:
```ts
  if (existingBooking) {
    const isApprovedAwaitingPayment = existingBooking.status === "approved" && existingBooking.payment_status !== "settled"

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <BookingStatusBadge status={existingBooking.status} />
          {(existingBooking.status === "pending" || existingBooking.status === "approved") && (
            <CancelBookingButton bookingId={existingBooking.id} rideId={rideId} />
          )}
        </div>
        {isApprovedAwaitingPayment && driverPaymentInfo && (
          <Alert>
            <AlertTitle>{tPayment("settlementInstructionTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <span>
                {tPayment("ibanLabel")}: <span className="font-mono font-medium">{driverPaymentInfo.iban}</span>
              </span>
              <span>
                {tPayment("ibanHolderLabel")}: {driverPaymentInfo.iban_holder_name}
              </span>
              <span className="text-muted-foreground">{tPayment("noCommissionDisclaimer")}</span>
              {driverTrustInfo && (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2">
                  <span className="text-muted-foreground text-xs">
                    {tPayment("driverMemberSince", {
                      date: format.dateTime(new Date(driverTrustInfo.memberSinceIso), { day: "2-digit", month: "2-digit", year: "numeric" }),
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {tPayment("driverCompletedRides", { count: driverTrustInfo.completedRideCount })}
                  </span>
                  {driverTrustInfo.averageRating !== null && (
                    <span className="flex items-center gap-1">
                      <StarRating rating={driverTrustInfo.averageRating} size="sm" />
                      <span className="text-muted-foreground text-xs">({driverTrustInfo.reviewCount})</span>
                    </span>
                  )}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/features/bookings/BookingButton.tsx src/app/rides/\[id\]/page.tsx`
Expected: no errors, no unused-import warnings (remove `Badge`/`ReceiptUploadForm` imports from `BookingButton.tsx` if the linter flags them unused).

- [ ] **Step 4: Commit**

```bash
git add src/features/bookings/BookingButton.tsx "src/app/rides/[id]/page.tsx"
git commit -m "bookings: show IBAN post-approval instead of pre-approval deposit alert"
```

---

## Task 5: `bookings/page.tsx` — remove the "awaiting offer deposits" section, fix the settle-button gate

**Files:**
- Modify: `src/app/bookings/page.tsx`

**Interfaces:**
- Consumes: `Booking.payment_status` now `"awaiting_settlement" | "settled"`.

- [ ] **Step 1: Remove deposit-only imports**

Remove `submitDepositReceipt` from the actions import and `getMyAwaitingDepositOffers` from the queries import:
```ts
import { submitDepositReceipt } from "@/features/bookings/actions"
...
import {
  getMyAwaitingDepositOffers,
  getMyBookings,
  getMyDriverOffers,
  getRideCounterpartyPhone,
  getRideDriverPaymentInfo,
} from "@/features/bookings/queries"
```
becomes (drop the whole `submitDepositReceipt` import line; drop `getMyAwaitingDepositOffers,` from the queries import):
```ts
import {
  getMyBookings,
  getMyDriverOffers,
  getRideCounterpartyPhone,
  getRideDriverPaymentInfo,
} from "@/features/bookings/queries"
```
`ReceiptUploadForm` stays imported (still used for refund proof elsewhere? — check: it's actually only used in the deleted section and `SettlementReceiptUpload` internally imports its own copy, so remove the `ReceiptUploadForm` import from this file too if nothing else in it references `ReceiptUploadForm` directly).

- [ ] **Step 2: Delete the `awaitingOfferDeposits`/`offerDepositPaymentInfo`/`offerDriverTrustInfo` computation block**

Delete this whole block (the comment + three `const` assignments, currently lines 59–98):
```ts
  // Task 2'nin depozito-sırası düzeltmesiyle mümkün olan tek yeni durum:
  // teklifim onaylandı ama henüz depozito ödemedim (...)
  const awaitingOfferDeposits = await getMyAwaitingDepositOffers(user.id)
  const offerDepositPaymentInfo = new Map(...)
  // Finding 4: bu ekranda, ilan sahibi hiç tanımadığı bir sürücünün IBAN'ına
  // depozito göndermeye karar veriyor (...)
  const offerDriverTrustInfo = new Map(...)
```

- [ ] **Step 3: Delete the "awaiting deposit offers" JSX section**

Delete the whole block starting `{awaitingOfferDeposits.length > 0 && (` through its matching `)}` (currently lines 230–291).

- [ ] **Step 4: Fix the settle-button gate**

Change:
```tsx
                    {isCompleted && booking.payment_status === "deposit_confirmed" && !booking.passenger_settled_at && (
                      <SettlePaymentButton bookingId={booking.id} rideId={booking.ride.id} />
                    )}
```
to:
```tsx
                    {isCompleted && booking.payment_status === "awaiting_settlement" && !booking.passenger_settled_at && (
                      <SettlePaymentButton bookingId={booking.id} rideId={booking.ride.id} />
                    )}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/bookings/page.tsx`
Expected: no errors, no unused-import warnings.

- [ ] **Step 6: Commit**

```bash
git add src/app/bookings/page.tsx
git commit -m "bookings: drop the awaiting-offer-deposit section, single settlement gate"
```

---

## Task 6: `rides/[id]/bookings/page.tsx` — fix the settle-button gate

**Files:**
- Modify: `src/app/rides/[id]/bookings/page.tsx`

- [ ] **Step 1: Fix the gate**

Change:
```tsx
                    {isRideOver && booking.payment_status === "deposit_confirmed" && !viewerSettled && (
                      <SettlePaymentButton bookingId={booking.id} rideId={id} />
                    )}
```
to:
```tsx
                    {isRideOver && booking.payment_status === "awaiting_settlement" && !viewerSettled && (
                      <SettlePaymentButton bookingId={booking.id} rideId={id} />
                    )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add "src/app/rides/[id]/bookings/page.tsx"
git commit -m "bookings: fix ride-owner settle-button gate for the new payment_status value"
```

---

## Task 7: `BookingActions.tsx` / `SettlePaymentButton.tsx` / `ReceiptUploadForm.tsx` — stale-comment cleanup

**Files:**
- Modify: `src/features/bookings/BookingActions.tsx`
- Modify: `src/features/bookings/SettlePaymentButton.tsx`
- Modify: `src/features/bookings/ReceiptUploadForm.tsx`

No behavior changes in this task — only comments that describe the old deposit semantics and would mislead the next person reading this code.

- [ ] **Step 1: `BookingActions.tsx`**

Change:
```tsx
// isOffer: bu satır bir yolcu ilanına verilen sürücü teklifiyse (booker_role
// ='driver') true — "Kaporayı Aldım, Onayla" (depozito zaten alınmış
// anlamına gelir) burada YANLIŞ olur, çünkü onay burada depozito ÖNCESİ
// gerçekleşir (bkz. supabase/migrations/0061_passenger_listing_offer_fixes.sql).
```
to:
```tsx
// isOffer: bu satır bir yolcu ilanına verilen sürücü teklifiyse (booker_role
// ='driver') true — o zaman "Teklifi Kabul Et" metni ve
// confirmApproveOffer/approveOffer i18n anahtarları kullanılır, normal bir
// rezervasyon talebinde ("approve"/"confirmApprove") değil.
```

- [ ] **Step 2: `SettlePaymentButton.tsx`**

Change:
```tsx
// Either party's "Kalan Ödeme Tamamlandı" confirmation, shown on a completed,
// deposit-confirmed booking (see /bookings and /rides/[id]/bookings) until
// payment_status reaches 'settled' (both sides confirmed).
```
to:
```tsx
// Either party's "Ödeme Tamamlandı" confirmation, shown on a completed,
// approved booking (see /bookings and /rides/[id]/bookings) until
// payment_status reaches 'settled' (both sides confirmed).
```

- [ ] **Step 3: `ReceiptUploadForm.tsx`**

Change:
```tsx
// Shared by DepositReceiptUpload (passenger -> driver's IBAN) and
// RefundProofUpload (driver -> passenger, after a cancelled/paid booking) —
// both just need a file picker that posts to a server action returning
// { error? }.
```
to:
```tsx
// Shared by SettlementReceiptUpload (passenger -> driver's IBAN, post-trip)
// and RefundProofUpload (driver -> passenger, after a cancelled/paid
// booking) — both just need a file picker that posts to a server action
// returning { error? }.
```

- [ ] **Step 4: Commit**

```bash
git add src/features/bookings/BookingActions.tsx src/features/bookings/SettlePaymentButton.tsx src/features/bookings/ReceiptUploadForm.tsx
git commit -m "bookings: fix stale deposit-era comments"
```

---

## Task 8: Admin backend — remove deposit receipt review, drop the bulk-approve `kind` param

**Files:**
- Modify: `src/features/admin/queries.ts`
- Modify: `src/features/admin/actions.ts`

**Interfaces:**
- Removes: `getPendingDepositReceipts` (queries.ts), `reviewDepositReceipt` (actions.ts).
- Produces: `adminBulkApproveReceipts(bookingIds: string[])` — the `kind` parameter is gone (matches Task 1's `admin_bulk_approve_receipts(uuid[])`).

- [ ] **Step 1: `queries.ts` — remove `getPendingDepositReceipts`**

Delete:
```ts
// Deposit receipts a passenger uploaded but nobody has reviewed yet — see
// submit_deposit_receipt/admin_review_deposit_receipt (0020_payment_receipts.sql).
export async function getPendingDepositReceipts(): Promise<AdminBookingRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(ADMIN_BOOKING_SELECT)
    .eq("deposit_receipt_status", "pending")
    .order("deposit_receipt_reviewed_at", { ascending: true, nullsFirst: true })
    .limit(ADMIN_LIST_LIMIT)

  return (data as unknown as AdminBookingRow[] | null) ?? []
}
```

- [ ] **Step 2: `actions.ts` — remove `reviewDepositReceipt`**

Delete:
```ts
// Same authorization shape as the others — admin_review_deposit_receipt is
// the sole enforcement point (0020_payment_receipts.sql, reason param added
// in 0025_settlement_receipts_and_reject_reasons.sql).
export async function reviewDepositReceipt(bookingId: string, approved: boolean, reason?: string): Promise<AdminActionState> {
  ...
  return { success: true }
}
```

- [ ] **Step 3: `actions.ts` — drop the `kind` parameter from `adminBulkApproveReceipts`**

Change:
```ts
export async function adminBulkApproveReceipts(bookingIds: string[], kind: "deposit" | "settlement"): Promise<AdminBulkActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_bulk_approve_receipts", { p_booking_ids: bookingIds, p_kind: kind })
```
to:
```ts
export async function adminBulkApproveReceipts(bookingIds: string[]): Promise<AdminBulkActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("admin_bulk_approve_receipts", { p_booking_ids: bookingIds })
```
(also update the comment above the function, which currently says "re-checks p_kind and that each row is still 'pending'" — drop the "re-checks p_kind and" part.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors surface in `src/app/admin/payments/page.tsx` and `src/features/admin/BulkApproveReceiptsButton.tsx` — that's Task 9.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/queries.ts src/features/admin/actions.ts
git commit -m "admin: remove deposit receipt review, drop bulk-approve kind param"
```

---

## Task 9: Admin frontend — remove the deposit receipts section from `/admin/payments`

**Files:**
- Modify: `src/app/admin/payments/page.tsx`
- Modify: `src/features/admin/BulkApproveReceiptsButton.tsx`
- Delete: `src/features/admin/DepositReceiptReviewActions.tsx`

**Interfaces:**
- Consumes: `adminBulkApproveReceipts(bookingIds: string[])` (Task 8's new signature).

- [ ] **Step 1: `BulkApproveReceiptsButton.tsx` — drop the `kind` prop**

Change:
```tsx
export function BulkApproveReceiptsButton({ bookingIds, kind }: { bookingIds: string[]; kind: "deposit" | "settlement" }) {
  const t = useTranslations("Admin.payments")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await adminBulkApproveReceipts(bookingIds, kind)
```
to:
```tsx
export function BulkApproveReceiptsButton({ bookingIds }: { bookingIds: string[] }) {
  const t = useTranslations("Admin.payments")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await adminBulkApproveReceipts(bookingIds)
```

- [ ] **Step 2: Delete `DepositReceiptReviewActions.tsx`**

Run: `git rm src/features/admin/DepositReceiptReviewActions.tsx`

- [ ] **Step 3: `admin/payments/page.tsx` — remove the deposit receipts section**

Remove the import:
```ts
import { DepositReceiptReviewActions } from "@/features/admin/DepositReceiptReviewActions"
```
Change the queries import — drop `getPendingDepositReceipts`:
```ts
import {
  getDriverPaymentInfoForAdmin,
  getPendingDepositReceipts,
  getPendingRefunds,
  getPendingSettlementReceipts,
  getSuspiciousAccounts,
  type AdminBookingRow,
} from "@/features/admin/queries"
```
becomes:
```ts
import {
  getPendingRefunds,
  getPendingSettlementReceipts,
  getSuspiciousAccounts,
  type AdminBookingRow,
} from "@/features/admin/queries"
```
(`getDriverPaymentInfoForAdmin` was only used to cross-check deposit receipts against the driver's IBAN — remove that import too, since nothing else in this file calls it. Leave `getDriverPaymentInfoForAdmin` itself defined in `src/features/admin/queries.ts` — it's harmless, unused-but-not-broken; deleting it is optional cleanup, not required for this task.)

Update the `Promise.all` that fetches page data — remove `getPendingDepositReceipts()`:
```ts
  const [pendingReceipts, pendingSettlements, pendingRefunds, suspiciousAccounts, disputedUserIds] = await Promise.all([
    getPendingDepositReceipts(),
    getPendingSettlementReceipts(),
    getPendingRefunds(),
    getSuspiciousAccounts(),
    getUserIdsWithOpenDisputes(),
  ])
```
becomes:
```ts
  const [pendingSettlements, pendingRefunds, suspiciousAccounts, disputedUserIds] = await Promise.all([
    getPendingSettlementReceipts(),
    getPendingRefunds(),
    getSuspiciousAccounts(),
    getUserIdsWithOpenDisputes(),
  ])
```

Remove these now-dead computations:
```ts
  const depositRiskTiers = pendingReceipts.map((booking) => riskTierFor(booking, booking.deposit_receipt_reject_count))
  ...
  const lowRiskDepositIds = pendingReceipts.filter((_, index) => depositRiskTiers[index] === "low").map((booking) => booking.id)
  ...
  const receiptUrls = await Promise.all(
    pendingReceipts.map((booking) => (booking.deposit_receipt_url ? getSignedReceiptUrl(booking.deposit_receipt_url) : null))
  )
  // Shown next to each pending deposit receipt so the admin can eyeball the
  // IBAN holder name against the uploaded receipt — there's no bank API
  // verifying the two actually match (see README → Bilinen Sınırlamalar).
  const driverPaymentInfos = await Promise.all(pendingReceipts.map((booking) => getDriverPaymentInfoForAdmin(booking.id)))
```
Keep `settlementRiskTiers` / `lowRiskSettlementIds` / `settlementReceiptUrls` / `refundProofUrls` as-is.

Remove the entire deposit receipts JSX block (the first `<div>` under the returned JSX, containing `{t("depositReceiptsTitle")}` and the `pendingReceipts.map(...)` card list):
```tsx
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t("depositReceiptsTitle")}</h2>
          {lowRiskDepositIds.length > 0 && <BulkApproveReceiptsButton bookingIds={lowRiskDepositIds} kind="deposit" />}
        </div>
        {pendingReceipts.length === 0 ? (
          ...
        )}
      </div>
```
Delete it entirely.

Update the remaining settlement `BulkApproveReceiptsButton` call to drop `kind`:
```tsx
          {lowRiskSettlementIds.length > 0 && <BulkApproveReceiptsButton bookingIds={lowRiskSettlementIds} kind="settlement" />}
```
becomes:
```tsx
          {lowRiskSettlementIds.length > 0 && <BulkApproveReceiptsButton bookingIds={lowRiskSettlementIds} />}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/payments/page.tsx src/features/admin/BulkApproveReceiptsButton.tsx`
Expected: no errors, no unused-import/unused-variable warnings.

- [ ] **Step 5: Commit**

```bash
git add -A src/app/admin/payments/page.tsx src/features/admin/BulkApproveReceiptsButton.tsx src/features/admin/DepositReceiptReviewActions.tsx
git commit -m "admin: remove the deposit receipts review section from /admin/payments"
```

---

## Task 10: i18n — `messages/tr.json`

**Files:**
- Modify: `messages/tr.json`

- [ ] **Step 1: `BookingsPage` — remove `awaitingDepositTitle`**

Delete the key (and the trailing comma on the preceding line):
```json
    "myOffersTitle": "Verdiğim Teklifler",
    "awaitingDepositTitle": "Onaylanan Teklifler İçin Depozito Ödemesi"
```
becomes:
```json
    "myOffersTitle": "Verdiğim Teklifler"
```

- [ ] **Step 2: `Bookings.actions` — reword `approve`/`confirmApprove`**

Change:
```json
      "approve": "Kaporayı Aldım, Onayla",
```
to:
```json
      "approve": "Onayla",
```
Change:
```json
      "confirmApprove": "Kaporayı aldığınızı onaylıyor musunuz?",
```
to:
```json
      "confirmApprove": "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?",
```

- [ ] **Step 3: `Bookings.payment` — swap the deposit alert for a settlement alert, drop deposit-only keys**

Change:
```json
    "payment": {
      "depositInstructionTitle": "Rezervasyonun kesinleşmesi için ücretin %25'ini saat {deadline}'e kadar aşağıdaki IBAN'a gönderin",
      "ibanLabel": "IBAN",
      "ibanHolderLabel": "Hesap Sahibi",
      "noCommissionDisclaimer": "Platformumuz komisyon almaz, ödemeler doğrudan şahıslar arasındadır.",
      "driverMemberSince": "Üyelik: {date}",
      "driverCompletedRides": "{count} tamamlanmış yolculuk",
      "settleCta": "Kalan Ödeme Tamamlandı",
      "settleSuccess": "Kalan ödeme tamamlandı olarak işaretlendi.",
      "uploadReceipt": "Dekont Yükle",
      "receiptUploadSuccess": "Dekont yüklendi, inceleme bekleniyor.",
      "receiptStatus": {
        "pending": "Dekont inceleniyor",
        "approved": "Dekont onaylandı",
```
to (drop `depositInstructionTitle` and `uploadReceipt` and the whole `receiptStatus` object — check the line(s) after `"approved": "Dekont onaylandı",` for a `"rejected"` entry and remove that too; reword `settleCta`/`settleSuccess` to drop "remaining" language since it's now the only/full payment):
```json
    "payment": {
      "settlementInstructionTitle": "Yolculuk tamamlandıktan sonra ücretin tamamını aşağıdaki IBAN'a gönder",
      "ibanLabel": "IBAN",
      "ibanHolderLabel": "Hesap Sahibi",
      "noCommissionDisclaimer": "Platformumuz komisyon almaz, ödemeler doğrudan şahıslar arasındadır.",
      "driverMemberSince": "Üyelik: {date}",
      "driverCompletedRides": "{count} tamamlanmış yolculuk",
      "settleCta": "Ödeme Tamamlandı",
      "settleSuccess": "Ödeme tamamlandı olarak işaretlendi.",
      "receiptUploadSuccess": "Dekont yüklendi, inceleme bekleniyor.",
```
(the closing of the `payment` object and whatever keys follow `receiptStatus` in the original stay, just with `receiptStatus` itself removed.)

- [ ] **Step 4: `Bookings.card` — drop "remaining" language from settlement receipt copy**

Change:
```json
      "uploadSettlementReceipt": "Kalan Ödeme Dekontu Yükle",
      "settlementReceiptStatus": {
        "pending": "Kalan ödeme dekontu inceleniyor",
        "approved": "Kalan ödeme dekontu onaylandı",
```
to:
```json
      "uploadSettlementReceipt": "Ödeme Dekontu Yükle",
      "settlementReceiptStatus": {
        "pending": "Ödeme dekontu inceleniyor",
        "approved": "Ödeme dekontu onaylandı",
```
and apply the same "Kalan ödeme dekontu" → "Ödeme dekontu" edit to the `"rejected"` entry that follows (read the file to find its exact current text and drop the word "Kalan").

- [ ] **Step 5: `Bookings.faq` (or wherever the `payment`/`depositRejected` FAQ entries live, around line 429) — update the payment FAQ answer**

Change:
```json
      "payment": {
        "question": "Ödeme nasıl yapılıyor?",
        "answer": "GötürBeni komisyon almaz. Rezervasyonun onaylanmasının ardından depozito tutarını sürücünün profilinde görünen IBAN'ına gönderir, dekontunu uygulama üzerinden yüklersin; incelenip onaylanınca rezervasyonun kesinleşir. Yolculuk sonrası kalan tutar için de aynı dekont/onay akışı kullanılır."
      },
      "depositRejected": {
        "question": "Yüklediğim dekont reddedilirse ne olur?",
        "answer": "Reddedilme nedeni sana gösterilir; sorunu giderip aynı rezervasyon için tekrar dekont yükleyebilirsin."
      },
```
to:
```json
      "payment": {
        "question": "Ödeme nasıl yapılıyor?",
        "answer": "GötürBeni komisyon almaz. Rezervasyonun onaylanması ödeme gerektirmez — yolculuk tamamlandıktan sonra ücretin tamamını sürücünün profilinde görünen IBAN'ına gönderir, dekontunu uygulama üzerinden yüklersin; incelenip onaylanınca ödeme tamamlanmış sayılır."
      },
      "depositRejected": {
        "question": "Yüklediğim dekont reddedilirse ne olur?",
        "answer": "Reddedilme nedeni sana gösterilir; sorunu giderip aynı rezervasyon için tekrar dekont yükleyebilirsin."
      },
```
(the `depositRejected` FAQ key's *content* is still accurate for settlement receipts — only its key name is now a misnomer. Renaming the JSON key would also require updating whatever component references `Bookings.faq.depositRejected` — grep for `"depositRejected"` under `src/` before renaming; if it's only referenced by key lookup in a generic FAQ-list component that doesn't care about the key name, leave the key name as-is to avoid an unnecessary additional edit surface. If you do rename it, rename to `settlementRejected` and update the one call site.)

- [ ] **Step 6: `Admin.payments` — remove the deposit receipts section copy**

Change:
```json
      "depositReceiptsTitle": "İncelenmeyi Bekleyen Dekontlar",
      "noPendingReceipts": "Bekleyen dekont yok",
      "settlementReceiptsTitle": "İncelenmeyi Bekleyen Kalan Ödeme Dekontları",
      "noPendingSettlements": "Bekleyen kalan ödeme dekontu yok",
```
to:
```json
      "settlementReceiptsTitle": "İncelenmeyi Bekleyen Ödeme Dekontları",
      "noPendingSettlements": "Bekleyen ödeme dekontu yok",
```

- [ ] **Step 7: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/tr.json','utf8'))"`
Expected: no output (parses clean).

- [ ] **Step 8: Commit**

```bash
git add messages/tr.json
git commit -m "i18n(tr): update payment copy for single post-trip payment"
```

---

## Task 11: i18n — `messages/en.json`

**Files:**
- Modify: `messages/en.json`

Apply the same structural edits as Task 10, with this English copy:

- [ ] **Step 1:** Remove `"awaitingDepositTitle": "Deposit Payment for Accepted Offers"` from `BookingsPage` (same comma fix as Task 10 Step 1).
- [ ] **Step 2:** `Bookings.actions.approve`: `"I've Received the Deposit, Approve"` → `"Approve"`. `Bookings.actions.confirmApprove`: `"Do you confirm you've received the deposit?"` → `"Are you sure you want to approve this booking request?"`.
- [ ] **Step 3:** `Bookings.payment`: remove `depositInstructionTitle` (`"To confirm your booking, send 25% of the fare to the IBAN below by {deadline}"`) and `uploadReceipt`, add `"settlementInstructionTitle": "After the ride is completed, send the full fare to the IBAN below"`, remove `receiptStatus` object, reword `settleCta` (`"Mark Remaining Payment as Complete"` → `"Mark Payment as Complete"`) and `settleSuccess` (`"Remaining payment marked as complete."` → `"Payment marked as complete."`).
- [ ] **Step 4:** `Bookings.card`: `uploadSettlementReceipt` (`"Upload Remaining Payment Receipt"` or equivalent — read the actual current string) → drop "Remaining"/"remaining"; same for `settlementReceiptStatus.pending/approved/rejected`.
- [ ] **Step 5:** `Bookings.faq.payment.answer`: update to match Task 10 Step 5's meaning (no deposit; full fare after the ride).
- [ ] **Step 6:** `Admin.payments`: remove `depositReceiptsTitle`/`noPendingReceipts`, drop "Remaining"/"remaining" from `settlementReceiptsTitle`/`noPendingSettlements` if present in their English wording.
- [ ] **Step 7:** Validate JSON: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'))"`.
- [ ] **Step 8:** Commit:
```bash
git add messages/en.json
git commit -m "i18n(en): update payment copy for single post-trip payment"
```

---

## Task 12: i18n — `messages/ar.json`

**Files:**
- Modify: `messages/ar.json`

Apply the same structural edits as Task 10. Arabic copy (already validated word-by-word for hamza placement and MSA correctness, reusing vocabulary already vetted elsewhere in this same file — e.g. `الأجرة` already appears in the current `depositInstructionTitle`, `أنت متأكد أنك تريد` already appears verbatim in `confirmApproveOffer`, `موافقة` already appears as `Admin.payments.approve`):

- [ ] **Step 1:** Remove `"awaitingDepositTitle": "دفع العربون للعروض المقبولة"` from `BookingsPage`.
- [ ] **Step 2:** `Bookings.actions.approve`: `"استلمت العربون، موافقة"` → `"موافقة"`. `Bookings.actions.confirmApprove`: `"هل تؤكد أنك استلمت العربون؟"` → `"هل أنت متأكد أنك تريد الموافقة على طلب الحجز هذا؟"`.
- [ ] **Step 3:** `Bookings.payment`: remove `"depositInstructionTitle": "لتأكيد حجزك، أرسل 25% من الأجرة قبل الساعة {deadline} إلى رقم IBAN التالي"` and `uploadReceipt`, add `"settlementInstructionTitle": "بعد اكتمال الرحلة، أرسل كامل الأجرة إلى رقم الـIBAN التالي"`, remove the `receiptStatus` object, reword `settleCta` (`"تم إكمال الدفعة المتبقية"` → `"تم إكمال الدفعة"`) and `settleSuccess` (`"تم تسجيل اكتمال الدفعة المتبقية."` → `"تم تسجيل اكتمال الدفعة."`).
- [ ] **Step 4:** `Bookings.card`: drop `المتبقية` ("remaining") from `uploadSettlementReceipt` and each `settlementReceiptStatus.*` entry — read the current exact strings first, remove only the "remaining" word/clause, keep the rest identical.
- [ ] **Step 5:** `Bookings.faq.payment.answer`: update to match Task 10 Step 5's meaning in Arabic — no upfront deposit, full fare sent after the ride completes. Write this one carefully (it's a full sentence, not a short label) and double-check hamza placement word-by-word before committing, per this project's Arabic-quality bar.
- [ ] **Step 6:** `Admin.payments`: remove `depositReceiptsTitle`/`noPendingReceipts` (`"إيصالات بانتظار المراجعة"` / associated "no pending" string), drop "المتبقية" from `settlementReceiptsTitle`/`noPendingSettlements` if present.
- [ ] **Step 7:** Validate JSON: `node -e "JSON.parse(require('fs').readFileSync('messages/ar.json','utf8'))"`.
- [ ] **Step 8:** Commit:
```bash
git add messages/ar.json
git commit -m "i18n(ar): update payment copy for single post-trip payment"
```

---

## Task 13: e2e — fix the two button-label-only spec files

**Files:**
- Modify: `e2e/booking-chat-review.spec.ts`
- Modify: `e2e/double-booking.spec.ts`

These two files click the driver's approve button by its old label text — that text changes in Task 10 (`"Kaporayı Aldım, Onayla"` → `"Onayla"`, confirm text → `"Bu rezervasyon talebini onaylamak istediğinize emin misiniz?"`). No other logic in these files depends on the deposit stage.

- [ ] **Step 1: `booking-chat-review.spec.ts`**

Change:
```ts
    await driverPage.getByRole("button", { name: "Kaporayı Aldım, Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Kaporayı aldığınızı onaylıyor musunuz?", exact: true }).click()
```
to:
```ts
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
```

- [ ] **Step 2: `double-booking.spec.ts`**

Change:
```ts
    const approveLabel = "Kaporayı Aldım, Onayla"
    const confirmApproveLabel = "Kaporayı aldığınızı onaylıyor musunuz?"
```
to:
```ts
    const approveLabel = "Onayla"
    const confirmApproveLabel = "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?"
```

- [ ] **Step 3: Run both specs**

Run: `npx playwright test booking-chat-review.spec.ts double-booking.spec.ts`
Expected: PASS (requires Tasks 1–10 already applied — DB migration, backend, and tr.json copy).

- [ ] **Step 4: Commit**

```bash
git add e2e/booking-chat-review.spec.ts e2e/double-booking.spec.ts
git commit -m "e2e: update approve-button label after removing the deposit step"
```

---

## Task 14: e2e — rewrite `payment-review.spec.ts`

**Files:**
- Modify: `e2e/payment-review.spec.ts`

**Design decision:** The old file demonstrated admin reject-with-reason on the *deposit* receipt. Since deposit receipts no longer exist, this plan moves the reject-with-reason coverage onto the *settlement* receipt instead (the RPC — `admin_review_settlement_receipt` — already supports a reject reason and was previously only exercised via a straight approve in this file, so this is equivalent coverage, not reduced coverage). The nearby-province search test and the IBAN cross-check test both stay, since neither is deposit-specific in nature — the IBAN cross-check just needs to point at the settlement receipt list instead of the deposit one.

- [ ] **Step 1: Replace the "passenger books" through "driver approves" tests**

Replace:
```ts
  test("passenger books the ride", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()
  })

  // The deposit-instructions alert and receipt upload are only shown while
  // the booking is still 'pending' (BookingButton.tsx's `awaitingDeposit` —
  // driver approval is itself the "I received the deposit" confirmation and
  // the whole payment panel disappears once that happens), so this has to
  // run before the driver approves, not after.
  test("passenger uploads a deposit receipt and the admin rejects it with a reason", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("deposit1.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    // The driver's registered IBAN/holder name shown next to the receipt —
    // the eyeball-cross-check mitigation for the "no real bank verification"
    // gap (README → Bilinen Sınırlamalar).
    await expect(adminPage.getByText("TR330006100519786457841326")).toBeVisible()

    await adminPage.getByRole("button", { name: "Reddet", exact: true }).first().click()
    await adminPage.getByPlaceholder("Red gerekçesi").fill("Dekont tutarı eksik görünüyor.")
    await adminPage.getByRole("button", { name: "Reddi Onayla", exact: true }).click()
    await expect(adminPage.getByText("Dekont reddedildi.")).toBeVisible()

    await passengerPage.goto(`/rides/${rideId}`)
    await expect(passengerPage.getByText("Dekont tutarı eksik görünüyor.")).toBeVisible()
  })

  test("passenger re-uploads the receipt, the admin approves it, and the driver approves the booking", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("deposit2.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    await adminPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await expect(adminPage.getByText("Dekont onaylandı.")).toBeVisible()

    await passengerPage.goto(`/rides/${rideId}`)
    await expect(passengerPage.getByText("Dekont onaylandı")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Kaporayı Aldım, Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Kaporayı aldığınızı onaylıyor musunuz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("after the ride departs, the passenger uploads a settlement receipt and the admin approves it", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("settlement1.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    await adminPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await expect(adminPage.getByText("Dekont onaylandı.")).toBeVisible()

    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Kalan ödeme dekontu onaylandı")).toBeVisible()
  })
```
with:
```ts
  test("passenger books the ride and the driver approves it (no payment involved yet)", async () => {
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible()

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("after the ride departs, the passenger uploads a settlement receipt and the admin rejects it with a reason", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("settlement1.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    // The driver's registered IBAN/holder name shown next to the receipt —
    // the eyeball-cross-check mitigation for the "no real bank verification"
    // gap (README → Bilinen Sınırlamalar). This admin page no longer has a
    // separate deposit-receipts section (Task 9), so this is now the only
    // pending-receipts list.
    await expect(adminPage.getByText("TR330006100519786457841326")).toBeVisible()

    await adminPage.getByRole("button", { name: "Reddet", exact: true }).first().click()
    await adminPage.getByPlaceholder("Red gerekçesi").fill("Dekont tutarı eksik görünüyor.")
    await adminPage.getByRole("button", { name: "Reddi Onayla", exact: true }).click()
    await expect(adminPage.getByText("Dekont reddedildi.")).toBeVisible()

    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Dekont tutarı eksik görünüyor.")).toBeVisible()
  })

  test("passenger re-uploads the settlement receipt and the admin approves it", async () => {
    await passengerPage.goto("/bookings")
    await passengerPage.locator('input[type="file"]').setInputFiles(receiptFilePayload("settlement2.png"))
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    await adminPage.goto("/admin/payments")
    await adminPage.getByRole("button", { name: "Onayla", exact: true }).first().click()
    await expect(adminPage.getByText("Dekont onaylandı.")).toBeVisible()

    await passengerPage.goto("/bookings")
    await expect(passengerPage.getByText("Ödeme dekontu onaylandı")).toBeVisible()
  })
```

- [ ] **Step 2: Update the file's top-of-describe comment**

Change:
```ts
// Regression coverage for this session's payment-review additions: deposit
// receipt reject-with-reason (0025_settlement_receipts_and_reject_reasons.sql),
// the settlement (post-trip remaining-half) receipt flow, the admin IBAN
// cross-check display, and the geographic nearby-province search fallback
// (turkish-provinces-geo.ts). None of these had any test before this session
// — see PROJECT_STATUS.md.
```
to:
```ts
// Regression coverage for payment-review: settlement receipt reject-with-reason
// (0025_settlement_receipts_and_reject_reasons.sql, now the only payment
// step — see 0062_single_payment_at_settlement.sql), the admin IBAN
// cross-check display, and the geographic nearby-province search fallback
// (turkish-provinces-geo.ts).
```

- [ ] **Step 3: Run the spec**

Run: `npx playwright test payment-review.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/payment-review.spec.ts
git commit -m "e2e: rewrite payment-review.spec.ts around the single settlement payment"
```

---

## Task 15: e2e — rewrite and rename `receipt-ocr-auto-approval.spec.ts`

**Files:**
- Delete: `e2e/receipt-ocr-auto-approval.spec.ts`
- Create: `e2e/settlement-ocr-auto-approval.spec.ts`

**Design decision:** The deposit-OCR-auto-approval feature (a receipt upload auto-approving the *booking itself*, before the driver ever clicks anything) no longer exists — approval is now purely the driver's manual decision, with no payment-driven auto-approve path pre-trip. Only the settlement OCR auto-match (post-trip, auto-confirming both sides' "I sent/received it" at once) survives, so the file is renamed to reflect that it's the only OCR auto-approval left, and its amount assertion moves from 75%-of-fare to the full fare.

- [ ] **Step 1: Delete the old file**

Run: `git rm e2e/receipt-ocr-auto-approval.spec.ts`

- [ ] **Step 2: Create the new file**

```ts
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { backdateRideDeparture, createRide, realisticReceiptFilePayload, signUpAndVerify, uniqueEmail } from "./utils"

// Coverage for the OCR-based settlement auto-approval
// (submit_settlement_receipt_ocr, 0054_settlement_ocr_auto_approval.sql,
// amount updated to the full fare by 0062_single_payment_at_settlement.sql):
// when an uploaded post-trip receipt's IBAN and amount match the ride's
// driver/full fare, the payment is confirmed automatically for both sides —
// neither party has to click a manual confirm button. The manual button
// stays as a fallback (covered by booking-chat-review.spec.ts and
// payment-review.spec.ts, both of which upload a receipt OCR can't match,
// confirming the manual flow is untouched). There is no more booking-level
// (pre-trip) OCR auto-approval — approval is now a plain manual driver
// decision, since there's nothing to pay before the ride.
test.describe.serial("settlement receipt OCR auto-approval", () => {
  const driverEmail = uniqueEmail("ocrDriver")
  const passengerEmail = uniqueEmail("ocrPassenger")

  let driverContext: BrowserContext
  let passengerContext: BrowserContext
  let driverPage: Page
  let passengerPage: Page
  let rideId: string

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    driverContext = await browser.newContext()
    passengerContext = await browser.newContext()
    driverPage = await driverContext.newPage()
    passengerPage = await passengerContext.newPage()
  })

  test.afterAll(async () => {
    await driverContext.close()
    await passengerContext.close()
  })

  test("driver and passenger sign up, driver creates a ride, passenger books and the driver approves", async () => {
    await signUpAndVerify(driverPage, driverEmail)
    await signUpAndVerify(passengerPage, passengerEmail)

    // createRide always sets the driver's IBAN to this exact value — the
    // settlement receipt below must match it for auto-approval to trigger.
    rideId = await createRide(driverPage, {
      departureCity: "Ankara",
      arrivalCity: "İstanbul",
      minutesAhead: 30,
      seatCount: 2,
      costShare: 200,
    })
    expect(rideId).toBeTruthy()

    // First visit to /rides/[id] in this file — Turbopack compiles routes on
    // demand, so this can take longer than the default 5s assertion timeout
    // on a cold run (same class of issue as playwright.config.ts's other
    // cold-compile notes).
    await passengerPage.goto(`/rides/${rideId}`)
    await passengerPage.getByRole("button", { name: "Rezervasyon Yap", exact: true }).click()
    await expect(passengerPage.getByText("Rezervasyon talebiniz gönderildi.")).toBeVisible({ timeout: 30_000 })

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await driverPage.getByRole("button", { name: "Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Bu rezervasyon talebini onaylamak istediğinize emin misiniz?", exact: true }).click()
    await expect(driverPage.getByText("Rezervasyon onaylandı.")).toBeVisible()
  })

  test("after the ride departs, a matching settlement receipt auto-settles the payment for both sides", async () => {
    await backdateRideDeparture(rideId, 10)

    await passengerPage.goto("/bookings")
    // Confirms the button is genuinely shown pre-settlement (payment_status
    // still 'awaiting_settlement') — otherwise the "not visible" check below
    // would be trivially true for the wrong reason.
    await expect(passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).toBeVisible()

    // Full fare, not a percentage of it — cost_share (200) * seat_count (1,
    // the booking default) = 200.
    const receipt = await realisticReceiptFilePayload(passengerPage, "settlement.png", "TR33 0006 1005 1978 6457 8413 26", 200)
    await passengerPage.locator('input[type="file"]').setInputFiles(receipt)
    await expect(passengerPage.getByText("Dekont yüklendi, inceleme bekleniyor.")).toBeVisible()

    // Auto-settlement confirms *both* sides at once (see 0054's comment for
    // why) — the "Ödeme Tamamlandı" button disappears once payment_status
    // reaches 'settled', on both the passenger's and driver's pages, without
    // either of them clicking it. Generous timeout for Tesseract's
    // worker_thread + WASM cold-start variance.
    await expect
      .poll(
        async () => {
          await passengerPage.goto("/bookings")
          return passengerPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true }).isVisible()
        },
        { timeout: 45_000, intervals: [1_000, 2_000, 3_000, 5_000] }
      )
      .toBe(false)

    await driverPage.goto(`/rides/${rideId}/bookings`)
    await expect(driverPage.getByRole("button", { name: "Ödeme Tamamlandı", exact: true })).not.toBeVisible()
  })
})
```

- [ ] **Step 3: Update `e2e/utils.ts`'s stale deposit-OCR comments**

Change:
```ts
// The OCR auto-approval risk gate (submit_deposit_receipt_ocr,
// 0053_deposit_ocr_auto_approval.sql) requires the account be ≥14 days
```
to:
```ts
// The OCR auto-approval risk gate (submit_settlement_receipt_ocr,
// 0054_settlement_ocr_auto_approval.sql) requires the account be ≥14 days
```
and change:
```ts
// (submit_deposit_receipt_ocr, src/lib/ocr.ts), which needs something a real
```
to:
```ts
// (submit_settlement_receipt_ocr, src/lib/ocr.ts), which needs something a real
```
(read the surrounding context of both comments first — these are one-line fixes inside larger existing comments, only the function-name reference changes.)

- [ ] **Step 4: Update the fake receipt's baked-in description text**

Find:
```ts
      <div>Aciklama: Yolculuk kaporasi</div>
```
in `e2e/utils.ts` (inside `realisticReceiptFilePayload`'s fake receipt HTML) and change it to:
```ts
      <div>Aciklama: Yolculuk odemesi</div>
```
("Yolculuk kaporası" = "trip deposit" → "Yolculuk ödemesi" = "trip payment" — this is fake receipt filler text for OCR testing, not user-facing, but should still match reality; keep it ASCII like the original since it's inside a generated-image text layer, not real Turkish diacritics).

- [ ] **Step 5: Run the new spec**

Run: `npx playwright test settlement-ocr-auto-approval.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A e2e/receipt-ocr-auto-approval.spec.ts e2e/settlement-ocr-auto-approval.spec.ts e2e/utils.ts
git commit -m "e2e: rename/rewrite deposit+settlement OCR spec to settlement-only, full fare"
```

---

## Task 16: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Full lint**

Run: `npx eslint .`
Expected: zero errors (warnings for pre-existing issues elsewhere in the repo are fine; nothing new from this plan's files).

- [ ] **Step 3: Full unit test suite**

Run: `npx vitest run`
Expected: all green, including `src/features/bookings/actions.test.ts`.

- [ ] **Step 4: Full e2e suite**

Run: `npx playwright test`
Expected: all green, including `passenger-listing.spec.ts` (untouched by this plan — proves the offer/approval flow still works with the new payment_status default) and every spec touched in Tasks 13–15.

- [ ] **Step 5: Grep for anything left behind**

Run: `grep -rn "awaiting_deposit\|deposit_confirmed\|depositInstructionTitle\|awaitingDepositTitle\|getMyAwaitingDepositOffers\|submitDepositReceipt\|reviewDepositReceipt\|getPendingDepositReceipts\|DepositReceiptReviewActions\|Kaporayı" src/ messages/ e2e/ supabase/migrations/`
Expected: matches only inside historical migration files (`0017`–`0061`, which are never edited) and this plan's own commit messages/comments explaining the history — nothing in live `src/`, current `messages/*.json` keys, or `e2e/`.

---

## Self-Review Notes (for the plan author, not a task)

- Spec coverage: every artifact identified during investigation (DB schema/RPCs/cron, TS types, actions/queries, 4 booking-facing pages/components, admin backend+frontend, 3 locale files, 6 e2e spec files, e2e/utils.ts) has a task. `actions.test.ts` needed no changes (verified it never tested the removed functions) — confirmed via Task 3 Step 5 instead of silently skipping it.
- The refund flow (`refund_status`, `submitRefundProof`, `admin_confirm_refund`) is deliberately left in place, not deleted — it becomes practically unreachable (no booking can have `payment_status = 'settled'` while still cancellable pre-departure), but ripping it out is a separate, larger change the user didn't ask for. Task 1's `cancel_ride_with_bookings` comment documents this explicitly for the next person who wonders why dead-looking code is still there.
- `deposit_confirmed` cannot be removed from the Postgres enum (no `DROP VALUE`) — Task 1 documents why it's harmless to leave as an unreachable label.
