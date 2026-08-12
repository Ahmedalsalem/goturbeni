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
-- Constraints). Gövdenin geri kalanı 0056_no_show_tightening_and_deposit_
-- ratio.sql'deki ile birebir aynı.
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

  perform public._apply_booking_approval(p_booking_id, v_ride.id, v_booking.seat_count, null);

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
