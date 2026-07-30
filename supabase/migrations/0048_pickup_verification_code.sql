-- Sürücünün, yolcunun gerçekten kendi onayladığı kişi olduğuna güvenmesi
-- için basit bir alım doğrulama kodu: rezervasyon onaylandığında 4 haneli
-- rastgele bir kod üretilir, yalnızca yolcuya gösterilir; sürücü yolcudan bu
-- kodu isteyip kendi ekranına girer, doğruysa yolculuk o rezervasyon için
-- "alındı" olarak işaretlenir.

create table public.booking_pickup_codes (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  code text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.booking_pickup_codes enable row level security;

-- Kasıtlı olarak HİÇBİR RLS politikası yok (select dahil — profiles_private'ın
-- aksine sahibi için bile yok). Kodun sürücü tarafından doğrudan bir
-- `.from("booking_pickup_codes").select()` sorgusuyla okunabilmesi, "yolcuya
-- sorup sözlü doğrulama" amacını tamamen ortadan kaldırırdı. Tüm erişim
-- aşağıdaki iki security-definer RPC üzerinden, kendi içlerinde rol kontrolü
-- yaparak: get_my_pickup_code yalnızca yolcuya kodu gösterir, verify_pickup_code
-- yalnızca sürücünün girdiği kodu sunucu tarafında karşılaştırır.

-- approve_booking (0017_booking_payment_flow.sql'in güncel sürümü), onay
-- anında bir alım kodu da üretecek şekilde genişletiliyor — imza/önceki
-- davranış aynen korunuyor, yalnızca sona bir insert ekleniyor.
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

  update public.bookings
    set status = 'approved', payment_status = 'deposit_confirmed'
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;

-- Yolcu kendi kodunu görür. Onay öncesi ya da kod henüz üretilmediyse
-- (kuramsal olarak olmamalı, approve_booking her zaman üretir) satır
-- dönmez — client tarafında null olarak yorumlanır.
create function public.get_my_pickup_code(p_booking_id uuid)
returns table (code text, verified_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.bookings where id = p_booking_id and passenger_id = auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return query
    select pc.code, pc.verified_at
    from public.booking_pickup_codes pc
    where pc.booking_id = p_booking_id;
end;
$$;

-- Her iki taraf da (yolcu veya sürücü) yalnızca doğrulanıp doğrulanmadığını
-- (boolean) görebilir — kodun kendisini değil. Sürücünün "zaten alındı"
-- durumuna geçmiş bir rezervasyon için tekrar kod girme formunu göstermemesi
-- için gerekli; get_my_pickup_code'un aksine driver_id'ye de açık.
create function public.get_pickup_verification_status(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verified boolean;
begin
  if not exists (
    select 1
    from public.bookings b
    join public.rides r on r.id = b.ride_id
    where b.id = p_booking_id
      and (b.passenger_id = auth.uid() or r.driver_id = auth.uid())
  ) then
    raise exception 'not_authorized';
  end if;

  select (pc.verified_at is not null) into v_verified
  from public.booking_pickup_codes pc
  where pc.booking_id = p_booking_id;

  return coalesce(v_verified, false);
end;
$$;

-- Sürücü, yolcudan sözlü aldığı kodu girer. `for update` eşzamanlı deneme
-- denemelerini serileştirir (brute-force zaten uygulama katmanındaki
-- rate-limit ile de sınırlanıyor, bkz. features/pickup/actions.ts).
create function public.verify_pickup_code(p_booking_id uuid, p_code text)
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
  if v_ride.driver_id <> auth.uid() then
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
