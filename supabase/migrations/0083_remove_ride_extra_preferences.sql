-- Kullanıcı talebi: sürücü ilan formundaki düşük değerli/niş tercihlerin
-- kaldırılması — "mola yapmadan" (no_stops), "sessiz yolculuk" (quiet_ride),
-- "büyük bagaj yok" (no_large_luggage, zaten araç özellikleri listesindeki
-- "geniş bagaj" ile örtüşüyor) ve "VIP (tek yolcu)" (vip_solo, sıfır arz
-- varken anlamsız, ayrıca koltuk sayısı mantığını karmaşıklaştırıyordu).
-- Veri kaybı riski yok: production'da şu ana kadar hiç gerçek ilan
-- verilmedi (bkz. oturum notları), bu kolonları kullanan gerçek satır yok.
--
-- generate_recurring_rides (0039/0060/0072) bu 4 kolonu hem okuyor hem yeni
-- occurrence'lara kopyalıyordu — kolonlar düşmeden önce fonksiyonun kendisi
-- güncellenmeli, yoksa "column does not exist" ile patlar.
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
        pets_allowed, smoking_allowed, car_features, custom_car_features, series_id
      ) values (
        v_series.driver_id, v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.car_features, v_series.custom_car_features, v_series.id
      );
    end if;
  end loop;
end;
$$;

alter table public.rides drop constraint if exists rides_vip_solo_single_seat;

alter table public.rides
  drop column vip_solo,
  drop column quiet_ride,
  drop column no_large_luggage,
  drop column no_stops;

alter table public.ride_series
  drop column vip_solo,
  drop column quiet_ride,
  drop column no_large_luggage,
  drop column no_stops;
