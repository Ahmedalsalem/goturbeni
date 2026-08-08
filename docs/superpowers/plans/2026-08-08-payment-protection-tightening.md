# Ödeme Koruması Sıkılaştırması (Faz 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No-show bildirimlerini otomatik dispute'a bağla, no-show'un şüpheli-hesap eşiğini düşür, sürücü no-show'unda kalan ödeme akışını durdur, depozito oranını %50'den %25'e indir.

**Architecture:** Var olan `rides`/`bookings`/`disputes` şemasına iki migration (`0055`, `0056` — enum değeri ile onu kullanan fonksiyonlar Postgres kısıtı yüzünden ayrı migration'larda olmalı). Mevcut RPC'ler (`report_no_show`, `confirm_remaining_payment`, `submit_settlement_receipt`, `submit_settlement_receipt_ocr`, `submit_deposit_receipt_ocr`, `get_suspicious_accounts_internal`) `create or replace` ile güncelleniyor — yeni tablo/RPC yok. Server action katmanında (`bookings/actions.ts`) yeni RPC hata mesajları çeviriliyor. i18n'de "yarı"/"%50" ifadelerinin geçtiği 3 dilde 8 anahtar güncelleniyor.

**Tech Stack:** Next.js 15 (App Router, Server Actions) + Supabase (Postgres, RLS, `security definer` RPC'ler) + next-intl (tr/en/ar) + Vitest (unit) + Playwright (e2e).

## Global Constraints

- Bu proje bir git worktree'de: `.claude/worktrees/payment-protection-tightening` (branch `worktree-payment-protection-tightening`). Tüm komutlar bu dizinde çalıştırılır.
- Migration dosya adları sıralı: son migration `0054_settlement_ocr_auto_approval.sql`, yeni dosyalar `0055_...` ve `0056_...`.
- Yeni bir enum değeri (`alter type ... add value`) eklendiği migration ile aynı transaction'da/migration'da KULLANILAMAZ (proje genelinde tekrarlanan bir Postgres kısıtı, bkz. `0041`/`0042`'nin kendi notu) — bu yüzden enum eklemesi (`0055`) ve onu kullanan fonksiyonlar (`0056`) ayrı dosyalarda olmalı.
- Bu ortamda gerçek/bağlı bir Supabase projesi yok — migration'lar `supabase db push` ile deploy edilemez, sadece dosya olarak repoda kalır (proje genelinde zaten böyle, bkz. `PROJECT_STATUS.md` Faz 16 notu). Doğrulama yalnızca: (a) SQL'in gözle/desenle doğruluğu (var olan fonksiyonlarla aynı desen), (b) `npm run lint` / `npx tsc --noEmit` / `npm test` (unit), (c) i18n anahtar eşleşmesi. E2E (Playwright) testleri bu ortamda ÇALIŞTIRILAMAZ (canlı Supabase + dev server gerektirir) — dosyalar güncellenir ama koşulmaz, bu açıkça raporlanacak.
- Commit mesajları Türkçe, projenin var olan commit geçmişiyle aynı üslupta.
- Her görevden sonra commit at.

---

### Task 1: Migration 0055 — `dispute_reason` enum'ına `no_show` ekle

**Files:**
- Create: `supabase/migrations/0055_no_show_dispute_reason.sql`

**Interfaces:**
- Produces: `public.dispute_reason` enum'ında yeni değer `'no_show'` — Task 2'nin `report_no_show` fonksiyonu bunu kullanacak.

- [ ] **Step 1: Migration dosyasını yaz**

```sql
-- Faz 1 — ödeme koruması sıkılaştırması (bkz.
-- docs/plans/2026-08-08-passenger-listings-and-payment-protection-design.md).
-- Yeni enum değeri, kullanan fonksiyonlarla aynı migration'da/transaction'da
-- olamaz (bkz. 0041/0042'nin aynı notu) — kullanan değişiklik 0056'da.
alter type public.dispute_reason add value 'no_show';
```

- [ ] **Step 2: Dosyanın var olan migration deseniyle tutarlı olduğunu gözden geçir**

`supabase/migrations/0041_no_show_and_late_cancellation.sql`'in sonundaki üç `alter type ... add value` satırıyla birebir aynı desen — karşılaştır, farklı bir sözdizimi kullanmadığından emin ol.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0055_no_show_dispute_reason.sql
git commit -m "$(cat <<'EOF'
dispute_reason enum'ına no_show değeri ekle

Faz 1 (ödeme koruması sıkılaştırması) — report_no_show'un otomatik
dispute açabilmesi için. Kullanan fonksiyon ayrı migration'da (0056),
yeni enum değerleri aynı transaction'da kullanılamıyor.
EOF
)"
```

---

### Task 2: Migration 0056 — otomatik dispute, no-show eşiği, ödeme guard'ları, %25 depozito

**Files:**
- Create: `supabase/migrations/0056_no_show_tightening_and_deposit_ratio.sql`

**Interfaces:**
- Consumes: `public.dispute_reason` değeri `'no_show'` (Task 1).
- Consumes (değişmeden okunan/referans alınan var olan tanımlar): `public.disputes` tablosu + `disputes_one_active_per_booking_opener` partial unique index (`booking_id, opened_by` where `status in ('open','in_review')`) — `supabase/migrations/0044_disputes.sql`. `public.bookings.driver_no_show`/`passenger_no_show` — `0041`. `public.get_suspicious_accounts_internal()` mevcut gövdesi — `0053_deposit_ocr_auto_approval.sql` satır 30-173 (bu görev bu fonksiyonu `create or replace` eder, `admin_get_suspicious_accounts()` ona delege ettiği için ayrıca dokunulmaz).
- Produces: `report_no_show`, `confirm_remaining_payment`, `submit_settlement_receipt`, `submit_settlement_receipt_ocr`, `submit_deposit_receipt_ocr`, `get_suspicious_accounts_internal` fonksiyonlarının güncellenmiş (`create or replace`) halleri — imzaları (parametre/dönüş tipleri) DEĞİŞMEDİ, sadece gövdeleri değişti. Task 4 (TS action katmanı) `error.message`'da `'driver_no_show'` string'ini arayacak.

- [ ] **Step 1: Migration dosyasının başlık yorumunu ve `report_no_show`'u yaz**

```sql
-- Faz 1 — ödeme koruması sıkılaştırması (bkz.
-- docs/plans/2026-08-08-passenger-listings-and-payment-protection-design.md).
-- Dört değişiklik: (1) no-show bildirimi artık otomatik bir dispute açar,
-- (2) no-show'un şüpheli-hesap eşiği 2 -> 1 (ilk olay bile admin kuyruğuna
-- düşer), (3) sürücü no-show'unda kalan ödeme akışı (manuel buton + dekont
-- yükleme + OCR otomatik onay) reddedilir, (4) depozito oranı %50 -> %25.
--
-- report_no_show: passenger_id/driver_id'yi işaretlerken aynı transaction'da
-- karşı tarafa karşı bir dispute açar. Zaten açık bir dispute varsa (elle
-- açılmış olabilir) disputes_one_active_per_booking_opener'ın partial unique
-- index'i arbiter olarak kullanılıp sessizce atlanır (0044_disputes.sql).
create or replace function public.report_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
  v_against uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found';
  end if;
  select * into v_ride from public.rides where id = v_booking.ride_id;

  if v_booking.status <> 'approved' then
    raise exception 'booking_not_eligible';
  end if;
  if v_ride.departure_time >= now() then
    raise exception 'ride_not_departed';
  end if;

  if auth.uid() = v_ride.driver_id then
    update public.bookings set passenger_no_show = true where id = p_booking_id;
    v_against := v_booking.passenger_id;
  elsif auth.uid() = v_booking.passenger_id then
    update public.bookings set driver_no_show = true where id = p_booking_id;
    v_against := v_ride.driver_id;
  else
    raise exception 'not_authorized';
  end if;

  insert into public.disputes (booking_id, opened_by, against_user_id, reason, description)
  values (p_booking_id, auth.uid(), v_against, 'no_show', 'Otomatik: no-show bildirildi.')
  on conflict (booking_id, opened_by) where status in ('open', 'in_review') do nothing;
end;
$$;
```

- [ ] **Step 2: `get_suspicious_accounts_internal`'da no-show eşiğini 2'den 1'e düşür (aynı dosyaya ekle)**

Var olan gövdeyi (`0053_deposit_ocr_auto_approval.sql` satır 30-173) birebir kopyala, yalnızca iki `union all` bloğundaki `having count(*) >= 2` satırlarını (frequent_passenger_no_show ve frequent_driver_no_show blokları) `having count(*) >= 1` yap. `frequent_late_cancellation` bloğu (`>= 2`) DOKUNULMADAN kalır — yalnızca no-show daha ağır bir sinyal olarak ayrıca sıkılaştırılıyor.

```sql
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
         sum(b.deposit_receipt_reject_count + b.settlement_receipt_reject_count)::text || ' reddedilen dekont'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.user_id = b.passenger_id
  group by b.passenger_id, p.full_name, af.is_suspended
  having sum(b.deposit_receipt_reject_count + b.settlement_receipt_reject_count) >= 3

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
```

- [ ] **Step 3: `confirm_remaining_payment`'a `driver_no_show` guard'ı ekle (aynı dosyaya ekle)**

```sql
create or replace function public.confirm_remaining_payment(p_booking_id uuid)
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
  if v_booking.status <> 'approved' then
    raise exception 'booking_not_approved';
  end if;
  if v_booking.driver_no_show then
    raise exception 'driver_no_show';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;
  if v_ride.departure_time >= now() then
    raise exception 'ride_not_completed';
  end if;

  if auth.uid() = v_ride.driver_id then
    update public.bookings set driver_settled_at = now() where id = p_booking_id;
  elsif auth.uid() = v_booking.passenger_id then
    update public.bookings set passenger_settled_at = now() where id = p_booking_id;
  else
    raise exception 'not_authorized';
  end if;

  update public.bookings
    set payment_status = 'settled'
    where id = p_booking_id and driver_settled_at is not null and passenger_settled_at is not null;
end;
$$;
```

- [ ] **Step 4: `submit_settlement_receipt`'a aynı guard'ı ekle (aynı dosyaya ekle)**

```sql
create or replace function public.submit_settlement_receipt(p_booking_id uuid, p_receipt_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
begin
  select * into v_booking from public.bookings where id = p_booking_id and passenger_id = auth.uid();
  if not found then
    raise exception 'not_authorized';
  end if;
  if v_booking.status <> 'approved' then
    raise exception 'booking_not_approved';
  end if;
  if v_booking.driver_no_show then
    raise exception 'driver_no_show';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;
  if v_ride.departure_time >= now() then
    raise exception 'ride_not_completed';
  end if;

  update public.bookings
    set settlement_receipt_url = p_receipt_url,
        settlement_receipt_status = 'pending',
        settlement_receipt_reviewed_at = null,
        settlement_receipt_reject_reason = null
    where id = p_booking_id;
end;
$$;
```

- [ ] **Step 5: `submit_settlement_receipt_ocr` ve `submit_deposit_receipt_ocr`'ı güncelle — driver_no_show guard'ı (yalnızca settlement) + depozito oranı %25 (aynı dosyaya ekle)**

```sql
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

  perform public._apply_booking_approval(p_booking_id, v_ride.id, v_booking.seat_count);

  update public.bookings
    set deposit_receipt_status = 'approved',
        deposit_receipt_reviewed_at = now()
    where id = p_booking_id;

  return true;
end;
$$;

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
    return false;
  end if;

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
```

- [ ] **Step 6: Dosyayı gözden geçir**

`supabase/migrations/0056_no_show_tightening_and_deposit_ratio.sql` toplam 6 `create or replace function` içermeli: `report_no_show`, `get_suspicious_accounts_internal`, `confirm_remaining_payment`, `submit_settlement_receipt`, `submit_deposit_receipt_ocr`, `submit_settlement_receipt_ocr`. Her birinin `returns`/parametre imzası, değiştirdiği orijinal migration'dakiyle (0041/0053/0017/0025/0053/0054) BİREBİR aynı olmalı — yalnızca gövde içeriği değişti.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0056_no_show_tightening_and_deposit_ratio.sql
git commit -m "$(cat <<'EOF'
No-show otomatik dispute + eşik sıkılaştırma + depozito %50->%25

report_no_show artık karşı tarafa otomatik bir dispute açıyor; no-show
tabanlı şüpheli-hesap kuralları 2+ yerine 1+ olayda tetikleniyor;
sürücü no-show'unda kalan ödeme akışı (manuel onay + dekont yükleme +
OCR otomatik onay) reddediliyor; depozito/kalan ödeme oranı OCR
tutar-eşleştirmesinde %50'den %25'e indirildi.
EOF
)"
```

---

### Task 3: Server action katmanı — `driver_no_show` hatasını çevir

**Files:**
- Modify: `src/features/bookings/actions.ts:176-194` (`confirmRemainingPayment`)
- Modify: `src/features/bookings/actions.ts:353-408` (`submitSettlementReceipt`)
- Modify: `messages/tr.json`, `messages/en.json`, `messages/ar.json` — `Bookings.errors` namespace'ine yeni anahtar

**Interfaces:**
- Consumes: Task 2'nin `confirm_remaining_payment`/`submit_settlement_receipt` RPC'lerinin `raise exception 'driver_no_show'` ile fırlattığı hata — Supabase JS `error.message` bu string'i içerir (Postgres `RAISE EXCEPTION` mesajı doğrudan `error.message`'a yansır, projede zaten `approveBooking`'in `not_enough_seats` kontrolünde aynı desen kullanılıyor).
- Produces: `tErrors("driverNoShow")` çeviri anahtarı çağrısı.

- [ ] **Step 1: `messages/tr.json`'a yeni hata anahtarını ekle**

`messages/tr.json` satır 619 (`"settleFailed": "..."`) hemen sonrasına ekle:

```json
      "settleFailed": "Ödeme tamamlandı olarak işaretlenemedi. Lütfen tekrar deneyin.",
      "driverNoShow": "Sürücü gelmedi olarak işaretlendiği için kalan ödeme işlenemez. Bir anlaşmazlık otomatik olarak açıldı.",
```

- [ ] **Step 2: `messages/en.json`'a aynı anahtarı ekle**

Aynı konumda (satır 619 civarı):

```json
      "settleFailed": "Payment could not be marked as settled. Please try again.",
      "driverNoShow": "The remaining payment can't be processed because the driver was reported as a no-show. A dispute has been opened automatically.",
```

- [ ] **Step 3: `messages/ar.json`'a aynı anahtarı ekle**

Aynı konumda (satır 619 civarı):

```json
      "settleFailed": "تعذر تسجيل اكتمال الدفعة المتبقية. حاول مرة أخرى.",
      "driverNoShow": "تعذر معالجة الدفعة المتبقية لأن السائق أُبلغ عن عدم حضوره. تم فتح نزاع تلقائيًا.",
```

- [ ] **Step 4: `confirmRemainingPayment`'ı güncelle**

`src/features/bookings/actions.ts` içinde:

```ts
export async function confirmRemainingPayment(bookingId: string, rideId: string): Promise<BookingActionState> {
  const { tErrors } = await getBookingTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("confirm_remaining_payment", { p_booking_id: bookingId })

  if (error) {
    logError(error, "bookings.confirmRemainingPayment")
    return { error: error.message.includes("driver_no_show") ? tErrors("driverNoShow") : tErrors("settleFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}
```

Değişiklik yalnızca `if (error)` bloğunun `return` satırı — geri kalan fonksiyon aynı kalır.

- [ ] **Step 5: `submitSettlementReceipt`'i güncelle**

`src/features/bookings/actions.ts` içinde, `submitSettlementReceipt`'in gövdesindeki tek `if (error) { logError(...); return { error: tErrors("actionFailed") } }` bloğunu (RPC çağrısı `submit_settlement_receipt` olan) şuna çevir:

```ts
  const { error } = await supabase.rpc("submit_settlement_receipt", { p_booking_id: bookingId, p_receipt_url: uploaded.path })
  if (error) {
    logError(error, "bookings.submitSettlementReceipt")
    return { error: error.message.includes("driver_no_show") ? tErrors("driverNoShow") : tErrors("actionFailed") }
  }
```

Dikkat: `submitDepositReceipt` fonksiyonunda da benzer bir `if (error) { ...; return { error: tErrors("actionFailed") } }` bloğu var (RPC `submit_deposit_receipt`) — BUNA DOKUNMA, `driver_no_show` guard'ı yalnızca settlement (kalan ödeme) tarafında, deposit'e eklenmedi (henüz sürücü ataması/onayı bile yapılmamış bir rezervasyonda "sürücü gelmedi" durumu oluşamaz).

- [ ] **Step 6: Lint + typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Beklenen: ikisi de temiz (0 hata).

- [ ] **Step 7: Commit**

```bash
git add src/features/bookings/actions.ts messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
driver_no_show RPC hatasını kalan ödeme akışında çevir

confirmRemainingPayment ve submitSettlementReceipt artık
confirm_remaining_payment/submit_settlement_receipt'in fırlattığı
driver_no_show hatasını genel settleFailed/actionFailed yerine özel
bir mesajla (Bookings.errors.driverNoShow, 3 dilde) gösteriyor.
EOF
)"
```

---

### Task 4: Unit testler — `reportNoShow` ve `confirmRemainingPayment`

**Files:**
- Modify: `src/features/bookings/actions.test.ts`

**Interfaces:**
- Consumes: `reportNoShow`, `confirmRemainingPayment` (zaten `src/features/bookings/actions.ts`'de var, Task 3 `confirmRemainingPayment`'ın hata dalını değiştirdi). Dosyanın tepesindeki `rpcMock`/`verifySessionMock`/`revalidatePathMock` mock altyapısı (dosyada zaten mevcut, bkz. satır 1-97) aynen kullanılır.
- Produces: Yok — bu görev yalnızca test ekler.

- [ ] **Step 1: `reportNoShow` için `describe` bloğu ekle**

`src/features/bookings/actions.test.ts`'in importlarına `reportNoShow`'u ekle:

```ts
import { approveBooking, cancelBooking, createBooking, rejectBooking, reportNoShow } from "@/features/bookings/actions"
```

Dosyanın sonuna (`cancelBooking` describe bloğundan sonra, dosyayı kapatan son `})`'dan önce) yeni bir describe bloğu ekle:

```ts
  describe("reportNoShow", () => {
    it("calls supabase.rpc with report_no_show and the booking id", async () => {
      rpcMock.mockResolvedValue({ error: null })

      await reportNoShow("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("report_no_show", { p_booking_id: "booking-1" })
    })

    it("maps an RPC error to actionFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "boom" } })

      const result = await reportNoShow("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.actionFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ error: null })

      const result = await reportNoShow("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1/bookings")
    })
  })
```

- [ ] **Step 2: Testi çalıştır, geçtiğini doğrula**

```bash
npx vitest run src/features/bookings/actions.test.ts -t "reportNoShow"
```

Beklenen: 3/3 PASS. (Bu üç test `reportNoShow`'un var olan davranışını doğruluyor — Task 2'de RPC'nin SQL gövdesi değişti ama TS action katmanı değişmedi, o yüzden bu testler yeni davranış değil var olan action wrapper'ı kanıtlıyor.)

- [ ] **Step 3: `confirmRemainingPayment` için `describe` bloğu ekle**

Aynı dosyada, importlara `confirmRemainingPayment`'ı da ekle:

```ts
import { approveBooking, cancelBooking, confirmRemainingPayment, createBooking, rejectBooking, reportNoShow } from "@/features/bookings/actions"
```

`reportNoShow` bloğunun ardından ekle:

```ts
  describe("confirmRemainingPayment", () => {
    it("calls supabase.rpc with confirm_remaining_payment and the booking id", async () => {
      rpcMock.mockResolvedValue({ error: null })

      await confirmRemainingPayment("booking-1", "ride-1")

      expect(rpcMock).toHaveBeenCalledWith("confirm_remaining_payment", { p_booking_id: "booking-1" })
    })

    it("maps a driver_no_show RPC error to the driverNoShow error path", async () => {
      rpcMock.mockResolvedValue({ error: { message: "driver_no_show" } })

      const result = await confirmRemainingPayment("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.driverNoShow")
    })

    it("maps any other RPC error to settleFailed", async () => {
      rpcMock.mockResolvedValue({ error: { message: "ride_not_completed" } })

      const result = await confirmRemainingPayment("booking-1", "ride-1")

      expect(result.error).toBe("Bookings.errors.settleFailed")
    })

    it("succeeds and revalidates on a clean RPC call", async () => {
      rpcMock.mockResolvedValue({ error: null })

      const result = await confirmRemainingPayment("booking-1", "ride-1")

      expect(result).toEqual({ success: true })
      expect(revalidatePathMock).toHaveBeenCalledWith("/bookings")
      expect(revalidatePathMock).toHaveBeenCalledWith("/rides/ride-1/bookings")
    })
  })
```

- [ ] **Step 4: Testi çalıştır, geçtiğini doğrula**

```bash
npx vitest run src/features/bookings/actions.test.ts -t "confirmRemainingPayment"
```

Beklenen: 4/4 PASS — özellikle `driver_no_show` testi Task 3'ün Step 4'ünde eklenen `error.message.includes("driver_no_show")` dalını kanıtlar.

- [ ] **Step 5: Tüm dosyayı çalıştır**

```bash
npx vitest run src/features/bookings/actions.test.ts
```

Beklenen: tüm testler (var olanlar + yeni eklenen 7 test) PASS, 0 FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/features/bookings/actions.test.ts
git commit -m "$(cat <<'EOF'
reportNoShow ve confirmRemainingPayment için unit test ekle

İkisi de daha önce test edilmiyordu. confirmRemainingPayment'ın yeni
driver_no_show hata dalı (bkz. önceki commit) ayrıca doğrulanıyor.
EOF
)"
```

---

### Task 5: i18n — "%50"/"yarı"/"half" ifadelerini %25'e uygun metne çevir (tr/en/ar)

**Files:**
- Modify: `messages/tr.json` (satır 236, 341, 386, 589, 593, 643 + `Disputes.form.reason` satır ~758, `Admin.disputes.reason` satır ~930)
- Modify: `messages/en.json` (aynı anahtarlar, aynı satır numaraları — dosyalar paralel yapıda)
- Modify: `messages/ar.json` (aynı anahtarlar, aynı satır numaraları)

**Interfaces:**
- Consumes: Yok (saf metin değişikliği).
- Produces: `Disputes.form.reason.no_show` ve `Admin.disputes.reason.no_show` anahtarları — Task 2'nin `report_no_show`'unun açtığı `dispute_reason = 'no_show'` kayıtlarının admin panelinde ve (varsa) yolcu/sürücü tarafında okunabilir bir etiketle görünmesi için (bu anahtarlar zaten var olan `Disputes.form.reason`/`Admin.disputes.reason` map'lerinin render ettiği; bu görev yalnızca haritaya yeni bir anahtar ekliyor, render mantığına dokunmuyor).

- [ ] **Step 1: `messages/tr.json` — `Bookings.actions.approve`/`confirmApprove` (satır 589, 593)**

```json
      "approve": "Kaporayı Aldım, Onayla",
      ...
      "confirmApprove": "Kaporayı aldığınızı onaylıyor musunuz?",
```

(Satır 589 ve 593, aralarındaki `reject`/`cancel`/`confirmCancel` satırlarına dokunma.)

- [ ] **Step 2: `messages/tr.json` — `Bookings.payment.depositInstructionTitle` (satır 643)**

```json
      "depositInstructionTitle": "Rezervasyonun kesinleşmesi için ücretin %25'ini saat {deadline}'e kadar aşağıdaki IBAN'a gönderin",
```

- [ ] **Step 3: `messages/tr.json` — `Profile.ibanHint` (satır 236)**

```json
      "ibanHint": "Sürücü olarak ilan verebilmek için gerekli — yolcular kapora ödemesini buraya gönderir.",
```

- [ ] **Step 4: `messages/tr.json` — `HowItWorksPage.steps.book.description` (satır 341)**

```json
        "description": "Sürücü rezervasyon talebini onayladığında yolculuğun kesinleşir. Yolcu, toplam ücretin %25'ini (kaporayı) sürücünün IBAN'ına gönderir ve dekontu yükler; kalan %75 yolculuk sonrasında ödenir."
```

- [ ] **Step 5: `messages/tr.json` — `RoutePage.costSharing.directDescription` (satır 386)**

```json
      "directDescription": "Ödemeyi yolcu doğrudan sürücünün IBAN'ına yapar; %25'i rezervasyonda, %75'i yolculuk sonrasında. GötürBeni araya girmez ve komisyon almaz.",
```

- [ ] **Step 6: `messages/tr.json` — `Disputes.form.reason.no_show` ve `Admin.disputes.reason.no_show`**

`Disputes.form.reason` map'ine (satır 754-758 civarı) `"other": "Diğer"`'den önce ekle:

```json
        "no_show": "Gelmedi (No-Show)",
```

`Admin.disputes.reason` map'ine (satır 926-930 civarı) aynı satırı aynı şekilde ekle.

- [ ] **Step 7: `messages/en.json` — aynı 8 anahtar**

```json
      "approve": "I've Received the Deposit, Approve",
      ...
      "confirmApprove": "Do you confirm you've received the deposit?",
      ...
      "depositInstructionTitle": "To confirm your booking, send 25% of the fare to the IBAN below by {deadline}",
      ...
      "ibanHint": "Required to post listings as a driver — passengers send their deposit payment here.",
```

```json
        "description": "Once the driver approves your booking request, your trip is confirmed. The passenger sends 25% of the total fare (the deposit) to the driver's IBAN and uploads the receipt; the remaining 75% is paid after the trip."
```

```json
      "directDescription": "The passenger pays the driver's IBAN directly — 25% at booking, 75% after the trip. GötürBeni never sits in the middle and takes no commission.",
```

`Disputes.form.reason` ve `Admin.disputes.reason`'a:

```json
        "no_show": "No-Show",
```

- [ ] **Step 8: `messages/ar.json` — aynı 8 anahtar**

```json
      "approve": "استلمت العربون، موافقة",
      ...
      "confirmApprove": "هل تؤكد أنك استلمت العربون؟",
      ...
      "depositInstructionTitle": "لتأكيد حجزك، أرسل 25% من الأجرة قبل الساعة {deadline} إلى رقم IBAN التالي",
      ...
      "ibanHint": "مطلوب لتتمكن كسائق من إضافة رحلة — يرسل الركاب دفعة العربون إلى هذا الحساب.",
```

```json
        "description": "عندما يوافق السائق على طلب الحجز يتأكد حجزك. يرسل الراكب 25% من قيمة الرحلة (العربون) إلى رقم IBAN الخاص بالسائق ويرفع إيصال الدفع؛ ويُدفع الـ75% المتبقية بعد الرحلة."
```

```json
      "directDescription": "يدفع الراكب مباشرة إلى حساب السائق (IBAN): 25% من المبلغ عند الحجز، و75% بعد انتهاء الرحلة. لا تتدخل GötürBeni في العملية ولا تتقاضى أي عمولة.",
```

`Disputes.form.reason` ve `Admin.disputes.reason`'a:

```json
        "no_show": "لم يحضر",
```

- [ ] **Step 9: i18n anahtar eşleşmesini doğrula**

`package.json`'da bunun için özel bir script yok (script listesi: `dev`/`build`/`start`/`lint`/`db:*`/`test`/`test:watch`/`test:e2e` — hiçbiri i18n anahtar karşılaştırması yapmıyor). Proje geçmişte bunu (`PROJECT_STATUS.md`'deki "i18n anahtar eşleşmesi (594/594)" notları) ad-hoc doğrulamış — aynı şekilde manuel bir Node one-liner ile üç dosyanın anahtar kümesi farkını al:

```bash
node -e "
const tr = require('./messages/tr.json');
const en = require('./messages/en.json');
const ar = require('./messages/ar.json');
function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, prefix + k + '.') : [prefix + k]
  );
}
const trKeys = new Set(keys(tr));
const enKeys = new Set(keys(en));
const arKeys = new Set(keys(ar));
const missing = (a, b, name) => [...a].filter(k => !b.has(k)).forEach(k => console.log(name + ' missing: ' + k));
missing(trKeys, enKeys, 'en');
missing(trKeys, arKeys, 'ar');
missing(enKeys, trKeys, 'tr (vs en)');
console.log('tr=' + trKeys.size + ' en=' + enKeys.size + ' ar=' + arKeys.size);
"
```

Beklenen: hiçbir "missing" satırı yazdırılmaz, üç sayı birbirine eşit.

- [ ] **Step 10: Lint + typecheck + unit test**

```bash
npm run lint
npx tsc --noEmit
npm test
```

Beklenen: üçü de temiz.

- [ ] **Step 11: Commit**

```bash
git add messages/tr.json messages/en.json messages/ar.json
git commit -m "$(cat <<'EOF'
Depozito metnini %50'den %25'e güncelle, no-show dispute etiketi ekle

"%50"/"yarı"/"half" geçen 6 anahtar (Bookings.actions.approve/
confirmApprove, Bookings.payment.depositInstructionTitle,
Profile.ibanHint, HowItWorksPage.steps.book.description,
RoutePage.costSharing.directDescription) 3 dilde %25'e uygun metne
çevrildi. Disputes.form.reason ve Admin.disputes.reason'a no_show
etiketi eklendi (report_no_show'un artık açtığı otomatik dispute'lar
için).
EOF
)"
```

---

### Task 6: E2E test dosyalarını güncelle (kod değişikliği — bu ortamda çalıştırılamaz)

**Files:**
- Modify: `e2e/payment-review.spec.ts:149-150`
- Modify: `e2e/receipt-ocr-auto-approval.spec.ts:71-72,95-98,110-111`

**Interfaces:**
- Consumes: Task 5'te değişen buton/onay metinleri (`"Kaporayı Aldım, Onayla"`, `"Kaporayı aldığınızı onaylıyor musunuz?"`), Task 2'de değişen depozito tutarı (₺200 × 1 koltuk × %25 = ₺50, önceki ₺100 yerine).
- Produces: Yok.

- [ ] **Step 1: `e2e/payment-review.spec.ts`'i güncelle**

Satır 149-150'yi:

```ts
    await driverPage.getByRole("button", { name: "İlk Yarı Ödemesini Aldım, Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "İlk yarı ödemesini aldığınızı onaylıyor musunuz?", exact: true }).click()
```

şuna çevir:

```ts
    await driverPage.getByRole("button", { name: "Kaporayı Aldım, Onayla", exact: true }).click()
    await driverPage.getByRole("button", { name: "Kaporayı aldığınızı onaylıyor musunuz?", exact: true }).click()
```

- [ ] **Step 2: `e2e/receipt-ocr-auto-approval.spec.ts`'i güncelle**

Satır 71-72'yi:

```ts
    // Deposit = cost_share (200) * seat_count (1, the booking default) * 0.5.
    const receipt = await realisticReceiptFilePayload(passengerPage, "deposit.png", "TR33 0006 1005 1978 6457 8413 26", 100)
```

şuna çevir:

```ts
    // Deposit = cost_share (200) * seat_count (1, the booking default) * 0.25.
    const receipt = await realisticReceiptFilePayload(passengerPage, "deposit.png", "TR33 0006 1005 1978 6457 8413 26", 50)
```

Satır 95-98'i (`İlk Yarı Ödemesini Aldım, Onayla` geçen buton kontrolü):

```ts
    // The driver never saw/clicked "İlk Yarı Ödemesini Aldım, Onayla" — if
    // it's still on the page, auto-approval didn't actually happen and some
    // other booking/state is showing "Onaylandı" instead.
    await expect(driverPage.getByRole("button", { name: "İlk Yarı Ödemesini Aldım, Onayla", exact: true })).not.toBeVisible()
```

şuna çevir:

```ts
    // The driver never saw/clicked "Kaporayı Aldım, Onayla" — if it's still
    // on the page, auto-approval didn't actually happen and some other
    // booking/state is showing "Onaylandı" instead.
    await expect(driverPage.getByRole("button", { name: "Kaporayı Aldım, Onayla", exact: true })).not.toBeVisible()
```

Satır 110-111'i:

```ts
    // Same amount as the deposit — cost_share (200) * seat_count (1) * 0.5.
    const receipt = await realisticReceiptFilePayload(passengerPage, "settlement.png", "TR33 0006 1005 1978 6457 8413 26", 100)
```

şuna çevir:

```ts
    // Same amount as the deposit — cost_share (200) * seat_count (1) * 0.25.
    const receipt = await realisticReceiptFilePayload(passengerPage, "settlement.png", "TR33 0006 1005 1978 6457 8413 26", 50)
```

- [ ] **Step 3: Diğer e2e dosyalarında aynı metinlerin geçmediğini doğrula**

```bash
grep -rn "İlk Yarı Ödemesini Aldım\|İlk yarı ödemesini aldığınızı" e2e/
```

Beklenen: sıfır sonuç (Step 1-2'de değiştirilen iki dosya dışında hiçbir yerde geçmiyor olmalı — eğer başka bir dosyada çıkarsa o da aynı şekilde güncellenmeli).

- [ ] **Step 4: TypeScript olarak derlendiğini doğrula (Playwright testleri gerçek koşulamaz ama tip kontrolü yapılabilir)**

Ayrı bir `e2e/tsconfig.json` yok — kök `tsconfig.json`'un `include` listesi (`**/*.ts`) zaten `e2e/`'yi kapsıyor, o yüzden proje kökünden tek komut yeterli:

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Bu testlerin GERÇEKTEN koşulamadığını raporla**

Bu worktree'de/ortamda canlı bir Supabase projesi ve çalışan bir dev server yok — `npx playwright test e2e/payment-review.spec.ts e2e/receipt-ocr-auto-approval.spec.ts` bu koşullarda başarısız olur (bağlantı hatası), bu beklenen bir durum. Bu iki dosyanın gerçek doğrulaması ancak CI'da veya bağlı bir Supabase projesiyle yapılabilir — final rapora açıkça yaz.

- [ ] **Step 6: Commit**

```bash
git add e2e/payment-review.spec.ts e2e/receipt-ocr-auto-approval.spec.ts
git commit -m "$(cat <<'EOF'
E2E testlerini %25 depozito oranına ve yeni buton metnine güncelle

payment-review.spec.ts ve receipt-ocr-auto-approval.spec.ts,
Task 2/5'teki depozito oranı (%50->%25) ve buton metni ("İlk Yarı
Ödemesini Aldım" -> "Kaporayı Aldım") değişikliklerini yansıtacak
şekilde güncellendi. Bu ortamda canlı Supabase/dev server olmadığı
için gerçek Playwright koşusu yapılamadı — yalnızca kaynak güncellendi.
EOF
)"
```

---

### Task 7: Son doğrulama ve rapor

**Files:** Yok (yalnızca komut çalıştırma).

- [ ] **Step 1: Tam test paketini çalıştır**

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

Beklenen: dördü de temiz/başarılı. `npm test` çıktısında Task 4'te eklenen 7 yeni test dahil toplam test sayısının baseline'daki 143'ten en az 7 fazla olduğunu doğrula.

- [ ] **Step 2: Diff'i gözden geçir**

```bash
git log --oneline master..HEAD
git diff master..HEAD --stat
```

Kontrol listesi (CLAUDE-CORE.md § 6):
- Yeni migration'lar (`0055`, `0056`) yalnızca `create or replace`/`alter type` içeriyor, hiçbir `drop`/veri kaybı yok.
- `bookings/actions.ts`'teki değişiklik yalnızca iki fonksiyonun hata dalı, başka bir davranış değişmedi.
- i18n'de üç dosyanın anahtar kümesi hâlâ birebir eşleşiyor (Task 5 Step 9).
- Hiçbir debug `console.log`/yorum satırı kalmamış.

- [ ] **Step 3: Kullanıcıya raporla**

Rapor şunu içermeli:
- Ne değişti (4 madde: otomatik dispute, eşik 2→1, ödeme guard'ları, %25).
- Ne doğrulandı: `npm test` (N/N geçti), `npm run lint`, `npx tsc --noEmit`, `npm run build` — hepsi bu oturumda gerçekten çalıştırıldı.
- Ne doğrulanamadı: e2e (Playwright) testleri — bu ortamda canlı Supabase/dev server yok, sadece kaynak güncellendi, gerçek koşu CI'da veya kullanıcının kendi ortamında yapılmalı. Migration'lar da `supabase db push` ile henüz hiçbir projeye uygulanmadı (proje genelinde zaten Faz 16'dan beri olan durum).
- Sıradaki adım: kullanıcı onaylarsa branch'i `master`'a merge et / PR aç, ya da migration'ları gerçek Supabase projesine uygula.

---

## Self-Review Notu (plan yazarı için, uygulama sırasında silinebilir)

- **Kapsam eşleşmesi:** Tasarım dokümanının Faz 1 bölümündeki 4 madde (otomatik dispute, eşik 2→1, ödeme guard'ları, %50→%25) → Task 1-2. i18n metin güncellemesi → Task 5. Test etkisi (aktörler.test.ts + e2e) → Task 4 + Task 6. Hepsi kapsandı.
- **Placeholder taraması:** Her SQL/TS/JSON bloğu tam kod, "TBD"/"benzer şekilde" yok — her dosya/anahtar için tam metin verildi.
- **Tip/imza tutarlılığı:** `report_no_show`, `confirm_remaining_payment`, `submit_settlement_receipt`, `submit_deposit_receipt_ocr`, `submit_settlement_receipt_ocr`, `get_suspicious_accounts_internal` — hepsinin parametre/dönüş tipi orijinal migration'larla birebir aynı (yalnızca `create or replace`, imza değişmedi), TS tarafında `error.message.includes("driver_no_show")` iki yerde (Task 3 Step 4 ve 5) aynı string'i arıyor.
