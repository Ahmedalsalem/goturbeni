-- Kullanıcı talebi: pets_allowed/smoking_allowed/vip_solo yanına birkaç
-- daha yolculuk tercihi. pets/smoking/vip_solo ile aynı desen: rides +
-- ride_series'e boolean kolon, generate_recurring_rides (0039/0060) her
-- occurrence'a kopyalar.
alter table public.rides
  add column quiet_ride boolean not null default false,
  add column no_large_luggage boolean not null default false,
  add column no_stops boolean not null default false;

alter table public.ride_series
  add column quiet_ride boolean not null default false,
  add column no_large_luggage boolean not null default false,
  add column no_stops boolean not null default false;

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
        pets_allowed, smoking_allowed, vip_solo, car_features, custom_car_features,
        quiet_ride, no_large_luggage, no_stops, series_id
      ) values (
        v_series.driver_id, v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.vip_solo, v_series.car_features, v_series.custom_car_features,
        v_series.quiet_ride, v_series.no_large_luggage, v_series.no_stops, v_series.id
      );
    end if;
  end loop;
end;
$$;
