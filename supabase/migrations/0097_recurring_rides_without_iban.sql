-- Kullanıcı isteği: IBAN artık zorunlu değil — IBAN'ı olmayan sürücü nakit
-- ödeme alır (taksi/Uber'deki gibi). generate_recurring_rides (son hâli
-- 0086) IBAN'ı olmayan sürücünün serisini sessizce atlıyordu; bu koşul
-- kaldırıldı. ride_series ödeme yöntemini saklamadığından üretilen ilan
-- rides.payment_methods varsayılanını (yalnızca bank_transfer) alıyordu —
-- IBAN'ı olmayan bir sürücü için bu, yolcuya ödeyemeyeceği bir yöntem
-- göstermek olurdu, o yüzden IBAN yoksa ilan yalnızca nakit olarak açılıyor.
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
  v_has_iban boolean;
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
    then
      v_has_iban := exists (
        select 1 from public.profiles_private pp
        where pp.id = v_series.driver_id and pp.iban is not null and pp.iban_holder_name is not null
      );

      insert into public.rides (
        driver_id, posted_by, departure_city, arrival_city, departure_district, arrival_district,
        departure_time, seat_count, available_seats, cost_share, description,
        pets_allowed, smoking_allowed, large_luggage_ok, child_seat_available, wheelchair_accessible,
        usb_charger_available, ac_available, series_id, payment_methods
      ) values (
        v_series.driver_id, v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.large_luggage_ok, v_series.child_seat_available,
        v_series.wheelchair_accessible, v_series.usb_charger_available, v_series.ac_available, v_series.id,
        case when v_has_iban then array['bank_transfer']::public.ride_payment_method[]
             else array['cash']::public.ride_payment_method[] end
      );
    end if;
  end loop;
end;
$$;
