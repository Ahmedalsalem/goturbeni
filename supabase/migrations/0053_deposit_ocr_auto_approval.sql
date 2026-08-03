-- Kapora dekontunun OCR (tesseract.js, src/lib/ocr.ts) ile otomatik
-- doğrulanması: yolcu dekont yüklediğinde IBAN + tutar dekonttan okunup
-- sürücünün kayıtlı IBAN'ı ve ilanın gerçek kapora tutarıyla (masraf payı ×
-- koltuk × 0.5) karşılaştırılır; eşleşir ve hesap düşük riskliyse rezervasyon
-- sürücünün "Aldım, Onayla" butonuna basmasına gerek kalmadan otomatik
-- onaylanır. Sürücünün manuel onay butonu (approve_booking) fallback olarak
-- aynen kalıyor.
--
-- Güvenlik notu: OCR sonucu (IBAN/tutar) yalnızca sunucu tarafında (server
-- action içinde) çıkarılıp aşağıdaki submit_deposit_receipt_ocr'a HAM veri
-- olarak geçilir; "eşleşti/eşleşmedi" kararı asla client'tan/server action'dan
-- bir boolean olarak gelmez, tamamen bu fonksiyonun kendi içinde, gerçek
-- sürücü IBAN'ı ve gerçek ilan tutarıyla yeniden hesaplanır. Aksi halde
-- (RPC'yi doğrudan PostgREST üzerinden çağırıp "matched: true" gönderen)
-- kötü niyetli bir istemci hiç para göndermeden kendi rezervasyonunu
-- onaylatabilirdi.

-- 1) admin_get_suspicious_accounts'taki gerçek bir hatayı düzelt --------------
-- Bu fonksiyon 0026'dan beri `admin_flags af on af.id = ...` ile join
-- yapıyordu, ama admin_flags'in PK'si `user_id` (0014_admin.sql) — `id` diye
-- bir kolon hiç var olmadı. Sonuç: fonksiyon her çağrıldığında
-- "column af.id does not exist" hatası fırlatıyordu, ve
-- getSuspiciousAccounts() (features/admin/queries.ts) yalnızca `data`'yı
-- okuyup `error`'u hiç kontrol etmediğinden bu sessizce yutuluyordu —
-- /admin/users'taki şüpheli hesap listesi ve /admin/payments'taki risk
-- rozetleri kuruluşundan beri hep boş/"suspicious değil" dönüyordu. Aynı
-- zamanda gövdeyi is_admin() kontrolü gerektirmeyen dahili bir fonksiyona
-- taşıyoruz ki aşağıdaki otomatik onay kontrolü de (admin olmayan bir yolcu
-- bağlamında) aynı kural setini tekrar yazmadan kullanabilsin.
create function public.get_suspicious_accounts_internal()
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
  having count(*) >= 2

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_driver_no_show'::public.suspicious_account_reason,
         count(*)::text || ' no-show (sürücü gelmedi)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.user_id = r.driver_id
  where b.driver_no_show
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 2

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

-- Yalnızca diğer security-definer fonksiyonların (sahibi aracılığıyla) dahili
-- çağırabilmesi için — doğrudan bir client'ın PostgREST üzerinden çağırıp
-- is_admin() kontrolünü atlamasını engeller.
revoke all on function public.get_suspicious_accounts_internal() from public, anon, authenticated;

create or replace function public.admin_get_suspicious_accounts()
returns table (user_id uuid, full_name text, is_suspended boolean, reason public.suspicious_account_reason, detail text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query select * from public.get_suspicious_accounts_internal();
end;
$$;

-- 2) OCR sonucunu tutacak kolonlar --------------------------------------------
alter table public.bookings
  add column deposit_ocr_iban text,
  add column deposit_ocr_amounts numeric(10, 2)[],
  add column deposit_ocr_checked_at timestamptz;

-- 3) approve_booking'in asıl etkisini paylaşılan bir yardımcıya çıkar ---------
-- Böylece sürücünün manuel onayı ile aşağıdaki otomatik onay tam olarak aynı
-- etkiyi (koltuk düşümü + alım kodu üretimi) uygular, iki yerde kopyalanmaz.
create function public._apply_booking_approval(p_booking_id uuid, p_ride_id uuid, p_seat_count integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rides
    set available_seats = available_seats - p_seat_count,
        status = case when available_seats - p_seat_count = 0 then 'full' else status end
    where id = p_ride_id;

  update public.bookings
    set status = 'approved', payment_status = 'deposit_confirmed'
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;

revoke all on function public._apply_booking_approval(uuid, uuid, integer) from public, anon, authenticated;

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
  if v_ride.driver_id <> auth.uid() then
    raise exception 'not_ride_driver';
  end if;
  if v_ride.available_seats < v_booking.seat_count then
    raise exception 'not_enough_seats';
  end if;

  perform public._apply_booking_approval(p_booking_id, v_ride.id, v_booking.seat_count);
end;
$$;

-- 4) OCR sonucunu kaydet + eşleşiyorsa otomatik onayla -------------------------
-- p_iban/p_amounts, src/lib/ocr.ts'in dekont görselinden çıkardığı ham
-- veridir — bu fonksiyon bunları "doğru" kabul etmez, sürücünün gerçek
-- kayıtlı IBAN'ı (profiles_private) ve ilanın gerçek kapora tutarıyla
-- (cost_share × seat_count × 0.5, ±5₺ tolerans) burada yeniden karşılaştırır.
-- Risk katmanı admin/features/risk.ts'teki computeReceiptRiskTier ile aynı
-- kriterleri kullanır: hesap ≥14 gün, askıya alınmamış, bu rezervasyonda
-- geçmiş dekont reddi yok, şüpheli hesap değil, açık anlaşmazlığı yok.
create function public.submit_deposit_receipt_ocr(p_booking_id uuid, p_iban text, p_amounts numeric[])
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

  v_expected_amount := round(v_ride.cost_share * v_booking.seat_count * 0.5, 2);
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
    return false; -- dolu — sürücünün manuel akışı/admin devreye girer
  end if;

  perform public._apply_booking_approval(p_booking_id, v_ride.id, v_booking.seat_count);

  -- Also clear the receipt off the admin's pending queue (getPendingDepositReceipts
  -- filters strictly on deposit_receipt_status='pending', independent of the
  -- booking's own status) — otherwise an auto-approved booking's receipt sat
  -- in "pending review" forever, showing the driver's IBAN there alongside
  -- every other still-genuinely-pending receipt.
  update public.bookings
    set deposit_receipt_status = 'approved',
        deposit_receipt_reviewed_at = now()
    where id = p_booking_id;

  return true;
end;
$$;
