-- Sürücü, bir yolcu ilanına teklif verirken artık kendi fiyatını önerebilir
-- (createOffer, önceden fiyatsızdı — ilanın cost_share'ini olduğu gibi kabul
-- ediyordu). Yolcunun ilanda girdiği cost_share sadece bir referans/istek —
-- parayı ALAN taraf sürücü olduğundan bağlayıcı bir tavan yok (kullanıcı
-- geri bildirimi: "sürücü o kadar parayı alacak, fiyatını neden indirsin" —
-- ilk tasarımda cost_share'i üst sınır yapmıştık, bu yanlış teşvikti).
-- Sürücünün teklifi onaylanınca ride.cost_share, onaylanan teklifin
-- fiyatına güncellenir ki ödeme/settlement akışının zaten okuduğu tek
-- kaynak (ride.cost_share) doğru kalsın — aşağıdaki hiçbir tüketici (IBAN
-- ödeme ekranı, settlement OCR, receipt karşılaştırması) değişmiyor.
alter table public.bookings
  add column offered_cost_share numeric check (offered_cost_share is null or offered_cost_share >= 0);

-- _apply_booking_approval (son hâli 0062_single_payment_at_settlement.sql):
-- yeni p_cost_share parametresi verildiğinde ride.cost_share'i de günceller.
-- Var olan tüm çağrı yerleri (approve_booking, instant_booking RPC'si,
-- 0065) pozisyonel 4 argümanla çağırıyor — yeni parametre 5. sırada ve
-- varsayılanı null olduğundan hiçbiri değişmeden çalışmaya devam eder.
create or replace function public._apply_booking_approval(
  p_booking_id uuid,
  p_ride_id uuid,
  p_seat_count integer,
  p_assign_driver_id uuid default null,
  p_cost_share numeric default null
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
        driver_id = coalesce(p_assign_driver_id, driver_id),
        cost_share = coalesce(p_cost_share, cost_share)
    where id = p_ride_id;

  update public.bookings
    set status = 'approved'
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;

-- approve_booking (son hâli 0060_passenger_listings_final_review_fixes.sql):
-- yolcu ilanı teklifi onaylanırken artık teklifin offered_cost_share'ini de
-- _apply_booking_approval'a geçiriyor.
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
    if v_ride.driver_id is distinct from auth.uid() then
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
    case when v_ride.posted_by_role = 'passenger' then v_booking.driver_id else null end,
    case when v_ride.posted_by_role = 'passenger' then v_booking.offered_cost_share else null end
  );
end;
$$;
