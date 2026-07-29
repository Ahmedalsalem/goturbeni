-- Kullanıcı talebi: no-show/geç iptal cezası. Karar (kullanıcı onayıyla):
-- ayrı bir puanlama sistemi kurmak yerine mevcut "şüpheli hesap" kural
-- motoruna (0026/0028/0029) iki yeni sinyal eklemek — admin görüp gerekirse
-- askıya alır, tıpkı diğer dört kural gibi.
--
-- cancelled_at: cancel_booking'in ne zaman çalıştığını kaydediyor, böylece
-- "kalkışa kaç saat kala iptal edildi" hesaplanabiliyor (bkz. 0042'deki
-- frequent_late_cancellation kuralı) — önceden bu bilgi hiç tutulmuyordu.
-- passenger_no_show/driver_no_show: rezervasyon durumuna yeni bir enum
-- değeri eklemek yerine ayrı boolean'lar — "onaylanmış ve gerçekleşmiş bir
-- rezervasyonun üzerine sonradan eklenen bir etiket", bookings.status'ün
-- kendi yaşam döngüsünü (pending/approved/rejected/cancelled) bozmuyor.
alter table public.bookings add column cancelled_at timestamptz;
alter table public.bookings add column passenger_no_show boolean not null default false;
alter table public.bookings add column driver_no_show boolean not null default false;

create or replace function public.cancel_booking(p_booking_id uuid)
returns boolean
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

  -- create or replace bütün gövdeyi değiştiriyor — seat_freed_at'i (0040)
  -- burada da korumak gerekiyor, yoksa bu migration onu sessizce sıfırlardı.
  update public.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        seat_freed_at = case when v_booking.status = 'approved' then now() else null end
    where id = p_booking_id;

  return v_booking.status = 'approved';
end;
$$;

-- Karşı taraf, kalkış saati geçmiş ONAYLANMIŞ bir rezervasyonda diğer
-- tarafın gelmediğini bildirebilir — sürücü yolcuyu, yolcu sürücüyü işaretler
-- (yön, auth.uid()'in hangi taraf olduğuna göre otomatik belirleniyor, ayrı
-- iki fonksiyon yerine tek fonksiyon). Kendi kendini işaretlemek mümkün değil
-- çünkü çağıran ya ride.driver_id ya da booking.passenger_id olmak zorunda.
create function public.report_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found';
  end if;
  select * into v_ride from public.rides where id = v_booking.ride_id;

  if v_booking.status <> 'approved' then
    raise exception 'booking_not_eligible';
  end if;
  if v_ride.departure_time >= now() then
    raise exception 'ride_not_departed';
  end if;

  if auth.uid() = v_ride.driver_id then
    update public.bookings set passenger_no_show = true where id = p_booking_id;
  elsif auth.uid() = v_booking.passenger_id then
    update public.bookings set driver_no_show = true where id = p_booking_id;
  else
    raise exception 'not_authorized';
  end if;
end;
$$;

-- Yeni enum değerleri aynı transaction'da kullanılamıyor (0028'deki not) —
-- kullanan değişiklik 0042'de, ayrı bir migration'da.
alter type public.suspicious_account_reason add value 'frequent_late_cancellation';
alter type public.suspicious_account_reason add value 'frequent_passenger_no_show';
alter type public.suspicious_account_reason add value 'frequent_driver_no_show';
