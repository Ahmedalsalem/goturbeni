-- Faz 4: bookings table — passenger seat requests against a ride, with
-- driver approve/reject and seat-count reconciliation. See
-- supabase/migrations/0002_rides.sql for the rides table this references.

create type booking_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  seat_count integer not null check (seat_count > 0),
  status booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Çifte rezervasyon koruması: aynı yolcu aynı ilana aktif (pending veya
-- approved) ikinci bir rezervasyon açamaz. Partial unique index, cancelled/
-- rejected geçmiş kayıtları etkilemez, yeniden rezervasyona izin verir.
create unique index bookings_one_active_per_passenger_ride on public.bookings (ride_id, passenger_id)
  where status in ('pending', 'approved');

create index bookings_ride_id_idx on public.bookings (ride_id);
create index bookings_passenger_id_idx on public.bookings (passenger_id);

alter table public.bookings enable row level security;

-- Yolcu kendi rezervasyonunu, ilgili sürücü kendi ilanına gelen
-- rezervasyonları görebilir; başka kimse göremez.
create policy "select own or driver bookings" on public.bookings
  for select using (
    auth.uid() = passenger_id
    or exists (select 1 from public.rides where rides.id = bookings.ride_id and rides.driver_id = auth.uid())
  );

-- Sadece kendi adına, doğrudan insert edebilir (seat_count doğrulaması ve
-- "kendi ilanına rezervasyon yapamaz" kuralı app katmanında da kontrol
-- edilir; burada sadece kimlik doğrulaması var).
create policy "insert own booking" on public.bookings
  for insert to authenticated
  with check (auth.uid() = passenger_id);

-- Kasıtlı olarak update policy'si YOK: status geçişleri (approve/reject/
-- cancel) sadece aşağıdaki security-definer fonksiyonlar üzerinden yapılır,
-- böylece rides.available_seats her zaman booking.status ile atomik kalır.
-- Doğrudan bir `.update()` çağrısıyla booking status'u değiştirilemez.

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

-- Sürücü bir bekleyen rezervasyonu onaylar. `for update` ile hem booking hem
-- ride satırı kilitlenir: aynı ilana eşzamanlı iki onaylama isteği serileşir,
-- ikincisi güncel available_seats'i görüp "yeterli koltuk yok" hatasıyla
-- başarısız olur — son koltuk için çifte onay (race condition) imkansızdır.
create function public.approve_booking(p_booking_id uuid)
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
  if v_ride.driver_id <> auth.uid() then
    raise exception 'not_ride_driver';
  end if;
  if v_ride.available_seats < v_booking.seat_count then
    raise exception 'not_enough_seats';
  end if;

  update public.rides
    set available_seats = available_seats - v_booking.seat_count,
        status = case when available_seats - v_booking.seat_count = 0 then 'full' else status end
    where id = v_ride.id;

  update public.bookings set status = 'approved' where id = p_booking_id;
end;
$$;

-- Sürücü bekleyen bir rezervasyonu reddeder — koltuk hiç ayrılmadığı için
-- (approve anına kadar available_seats düşürülmez) sayaç değişmez.
create function public.reject_booking(p_booking_id uuid)
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
  if v_ride.driver_id <> auth.uid() then
    raise exception 'not_ride_driver';
  end if;

  update public.bookings set status = 'rejected' where id = p_booking_id;
end;
$$;

-- Yolcu kendi rezervasyonunu iptal eder. Daha önce approved idiyse
-- ayrılmış koltuk geri iade edilir ve ilan 'full' ise 'active'e döner.
create function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.passenger_id <> auth.uid() then
    raise exception 'not_booking_owner';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'booking_not_cancellable';
  end if;

  if v_booking.status = 'approved' then
    update public.rides
      set available_seats = available_seats + v_booking.seat_count,
          status = case when status = 'full' then 'active' else status end
      where id = v_booking.ride_id;
  end if;

  update public.bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;
