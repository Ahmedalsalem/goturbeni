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
