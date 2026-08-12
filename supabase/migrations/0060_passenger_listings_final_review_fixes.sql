-- Faz 2A çapraz kesitli final review'da bulunan üç canlı fonksiyon hatası:
--
-- 1) generate_recurring_rides() (0039) rides.posted_by'ı (0057'de NOT NULL,
--    default'suz yapıldı) INSERT listesine hiç eklemiyordu — pg_cron her gece
--    çalıştığında ilk uygun seride "null value in column posted_by" hatasıyla
--    patlıyor, döngü exception handling içermediğinden o geceki TÜM seriler
--    (yalnızca patlayan değil) sessizce atlanmış oluyordu.
--
-- 2) approve_booking/reject_booking (0059) ve verify_pickup_code (0048),
--    sürücü dalında `v_ride.driver_id <> auth.uid()` kontrolü kullanıyordu.
--    driver_id 0057'den önce hep NOT NULL'dı; artık (yolcu ilanı onay
--    öncesi) NULL olabiliyor. SQL'de NULL <> herhangi_bir_şey → NULL, ve
--    `if NULL then` hiç çalışmıyor — yani driver_id NULL iken bu kontrol
--    sessizce geçiyor (fail-OPEN). `is distinct from` NULL'ı doğru şekilde
--    "eşit değil" sayar (fail-CLOSED).
--
-- 3) cancel_ride_with_bookings (0021) hâlâ `driver_id = auth.uid()` ile
--    yetkilendiriyordu; planın geri kalanı (Task 5) sahiplik kontrolünü
--    posted_by'a taşımıştı. Bu fail-CLOSED olduğundan güvenlik açığı değil
--    (NULL driver_id sadece "satır bulunamadı" demek) ama planın kendi
--    tutarlılığıyla çelişiyordu.
--
-- Üç fonksiyon da CREATE OR REPLACE ile, gövdeleri kaynak dosyalarından
-- birebir kopyalanıp yalnızca ilgili tek satır değiştirilerek yeniden
-- tanımlanıyor. _apply_booking_approval (0059) ve generate_recurring_rides'ın
-- pg_cron zamanlaması (0039) bu migration'da tekrar edilmiyor — ikisi de
-- değişmedi, zaten canlı ve bir kez çalıştırılmaları yeterli.

create or replace function public.generate_recurring_rides()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series record;
  v_local_today date;
  v_next_local_date date;
  v_next_departure timestamptz;
begin
  v_local_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_series in select * from public.ride_series where is_active loop
    v_next_local_date := v_local_today + ((v_series.weekday - extract(dow from v_local_today)::int + 7) % 7);
    v_next_departure := (v_next_local_date + v_series.departure_time_of_day) at time zone 'Europe/Istanbul';
    if v_next_departure < now() then
      v_next_departure := v_next_departure + interval '7 days';
    end if;

    if v_next_departure - now() <= make_interval(days => v_series.lead_days)
      and not exists (
        select 1 from public.rides
        where series_id = v_series.id and departure_time = v_next_departure
      )
      and exists (
        select 1 from public.profiles_private pp
        where pp.id = v_series.driver_id and pp.iban is not null and pp.iban_holder_name is not null
      )
    then
      insert into public.rides (
        driver_id, posted_by, departure_city, arrival_city, departure_district, arrival_district,
        departure_time, seat_count, available_seats, cost_share, description,
        pets_allowed, smoking_allowed, vip_solo, series_id
      ) values (
        v_series.driver_id, v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.vip_solo, v_series.id
      );
    end if;
  end loop;
end;
$$;

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
    if v_ride.driver_id is distinct from auth.uid() then
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

create or replace function public.verify_pickup_code(p_booking_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
  v_pickup public.booking_pickup_codes;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.status <> 'approved' then
    raise exception 'booking_not_approved';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;
  if v_ride.driver_id is distinct from auth.uid() then
    raise exception 'not_ride_driver';
  end if;

  select * into v_pickup from public.booking_pickup_codes where booking_id = p_booking_id for update;
  if not found then
    raise exception 'no_pickup_code';
  end if;
  if v_pickup.verified_at is not null then
    raise exception 'already_verified';
  end if;
  if v_pickup.code <> p_code then
    raise exception 'invalid_code';
  end if;

  update public.booking_pickup_codes set verified_at = now() where booking_id = p_booking_id;
end;
$$;

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

  -- Ödemesi alınmış (deposit_confirmed/settled) onaylı rezervasyonlar iade
  -- sürecine girer; henüz ödeme alınmamışsa (awaiting_deposit) veya talep
  -- hâlâ beklemedeyse doğrudan iptal edilir, iade gerekmez.
  update public.bookings
    set status = 'cancelled',
        refund_status = 'pending',
        refund_requested_at = now()
    where ride_id = p_ride_id
      and status = 'approved'
      and payment_status in ('deposit_confirmed', 'settled');

  update public.bookings
    set status = 'cancelled'
    where ride_id = p_ride_id
      and status in ('pending', 'approved')
      and payment_status = 'awaiting_deposit';
end;
$$;
