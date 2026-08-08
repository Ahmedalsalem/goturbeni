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
