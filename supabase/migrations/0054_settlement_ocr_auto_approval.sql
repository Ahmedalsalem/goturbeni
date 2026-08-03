-- Kalan ödeme (settlement) dekontu için, kaporadaki (0053) ile aynı OCR
-- otomatik onay mantığı. Kapora akışından fark: kalan ödeme "onaylandı"
-- sayılması için normalde İKİ ayrı taraf onayı gerekir (confirm_remaining_payment
-- — sürücü "aldım" der, yolcu "gönderdim" der, ikisi de gerekince
-- payment_status 'settled'e geçer). Yolcunun gerçekten doğru IBAN'a doğru
-- tutarı gönderdiğini gösteren bir dekont yüklemesi, zaten kendi
-- "gönderdim" beyanının kanıtı olduğundan, OCR eşleştiğinde bu fonksiyon
-- HER İKİ tarafın da onayını verir (driver_settled_at + passenger_settled_at)
-- — yolcuya ayrıca "Kalan Ödeme Tamamlandı" butonuna basmasını istemek
-- gereksiz bir sürtünme olurdu, zaten kanıtladığı şeyi tekrar tıklatmak gibi.
-- Sürücünün/yolcunun manuel buton akışı (confirm_remaining_payment) eşleşmeyen/
-- yüksek riskli durumlar için yedek olarak aynen kalıyor.
alter table public.bookings
  add column settlement_ocr_iban text,
  add column settlement_ocr_amounts numeric(10, 2)[],
  add column settlement_ocr_checked_at timestamptz;

create function public.submit_settlement_receipt_ocr(p_booking_id uuid, p_iban text, p_amounts numeric[])
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

  if v_booking.status <> 'approved' or v_booking.payment_status = 'settled' then
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

  v_expected_amount := round(v_ride.cost_share * v_booking.seat_count * 0.5, 2);
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
