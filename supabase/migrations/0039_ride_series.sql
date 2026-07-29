-- Kullanıcı talebi: "tekrarlanan ilan" — sürücü her hafta aynı güzergahı
-- tekrar tekrar elle oluşturmak zorunda kalmasın. Tasarım: sürücü ilk
-- ilanı normal şekilde oluştururken "her hafta tekrarla" işaretlerse, o
-- ilanın gün/saatini yakalayan bir ride_series satırı oluşturuluyor; her
-- gece çalışan bir cron, lead_days içine giren bir sonraki haftanın
-- ilanını (seri hâlâ aktifse ve sürücünün IBAN'ı hâlâ kayıtlıysa) otomatik
-- açıyor. Bir haftanın ilanını iptal etmek yalnızca o haftayı etkiler —
-- var olan cancel_ride_with_bookings zaten tek bir rides satırı üzerinde
-- çalışıyor, seriye dokunmuyor; seriyi tamamen durdurmak ayrı bir işlem
-- (is_active=false).
create table public.ride_series (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  departure_city text not null,
  arrival_city text not null,
  departure_district text,
  arrival_district text,
  -- Postgres'in extract(dow from ...) kuralıyla aynı: 0=Pazar .. 6=Cumartesi.
  weekday smallint not null check (weekday between 0 and 6),
  departure_time_of_day time not null,
  seat_count integer not null check (seat_count > 0),
  cost_share numeric(10, 2) not null check (cost_share >= 0),
  description text check (char_length(description) <= 500),
  pets_allowed boolean not null default false,
  smoking_allowed boolean not null default false,
  vip_solo boolean not null default false,
  is_active boolean not null default true,
  lead_days integer not null default 7 check (lead_days between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ride_series_driver_id_idx on public.ride_series (driver_id);

alter table public.ride_series enable row level security;

create policy "select own ride series" on public.ride_series
  for select to authenticated
  using (auth.uid() = driver_id);

create policy "insert own ride series" on public.ride_series
  for insert to authenticated
  with check (auth.uid() = driver_id);

-- Yalnızca durdurma (is_active) için — diğer alanlar sabit kalıyor,
-- düzenleme akışı bu oturumun kapsamı dışında.
create policy "update own ride series" on public.ride_series
  for update to authenticated
  using (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);

alter table public.rides add column series_id uuid references public.ride_series (id) on delete set null;
create index rides_series_id_idx on public.rides (series_id);

-- Her gece çalışır (dakika hassasiyeti gerekmiyor — lead_days penceresi
-- gün bazlı). "Europe/Istanbul" burada AÇIKÇA kullanılıyor çünkü Postgres
-- session/sunucu saat dilimine güvenmek daha önce gerçek bir üretim
-- hatasına yol açmıştı (bkz. src/i18n/request.ts'teki yorum) — bu fonksiyon
-- lokal duvar saatini (gün + departure_time_of_day) İstanbul'da olduğu
-- gibi yorumlayıp doğru UTC anına çeviriyor.
create function public.generate_recurring_rides()
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
        driver_id, departure_city, arrival_city, departure_district, arrival_district,
        departure_time, seat_count, available_seats, cost_share, description,
        pets_allowed, smoking_allowed, vip_solo, series_id
      ) values (
        v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.vip_solo, v_series.id
      );
    end if;
  end loop;
end;
$$;

select cron.schedule('generate-recurring-rides', '0 3 * * *', $$select public.generate_recurring_rides()$$);
