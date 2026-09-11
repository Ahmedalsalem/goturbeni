-- Kullanıcı isteği: ilan formundaki "Araç Özellikleri" (car_features/
-- custom_car_features) çoklu-seçim listesi kaldırılıyor (0070/0071'in
-- getirdiği kolonlar burada bilerek DROP edilmiyor — production'da zaten
-- gerçek veri var, geriye dönük ilan/kart görünümü bozulmasın diye) — yerine
-- pets_allowed/smoking_allowed ile aynı tek-tık boolean stilinde 3 yeni
-- tercih ekleniyor. Bu üçü ve pets_allowed/smoking_allowed artık hem sürücü
-- (araçta/ilanda ne var) hem yolcu (kendi ihtiyacım) tarafında anlamlı —
-- src/features/rides/schemas.ts'teki passenger-reset artık bunları sıfırlamıyor.
alter table public.rides
  add column large_luggage_ok boolean not null default false,
  add column child_seat_available boolean not null default false,
  add column wheelchair_accessible boolean not null default false;

alter table public.ride_series
  add column large_luggage_ok boolean not null default false,
  add column child_seat_available boolean not null default false,
  add column wheelchair_accessible boolean not null default false;

-- rides has column-level (not table-level) update grants for `authenticated`
-- (0058), and every migration since that added a rides column forgot this
-- step at least once (0074 fixed the drift left by 0065/0070-0073) — redo
-- the same dynamic full re-grant so this one doesn't repeat that mistake.
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ') into v_columns
    from pg_attribute
    where attrelid = 'public.rides'::regclass
      and attnum > 0
      and not attisdropped
      and attname not in ('driver_id', 'posted_by_role');
  execute format('grant update (%s) on public.rides to authenticated', v_columns);
end $$;

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
        pets_allowed, smoking_allowed, large_luggage_ok, child_seat_available, wheelchair_accessible, series_id
      ) values (
        v_series.driver_id, v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.large_luggage_ok, v_series.child_seat_available,
        v_series.wheelchair_accessible, v_series.id
      );
    end if;
  end loop;
end;
$$;
