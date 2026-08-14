-- Anında rezervasyon: sürücü ilan verirken "Anında Onay" açarsa, koltuk
-- müsaitse yolcunun rezervasyon talebi hiç 'pending' durumuna girmeden
-- doğrudan onaylanır. Yalnızca normal sürücü ilanlarına uygulanıyor —
-- yolcu ilanı/teklif akışında onay artık zorunlu bir IBAN/plaka hazırlık
-- kontrolünden geçiyor (get_offer_driver_readiness, 0063), bu akış bu
-- migration'ın kapsamı dışında bırakılıyor.
alter table public.rides
  add column instant_booking boolean not null default false;

-- create_booking: src/features/bookings/actions.ts'teki createBooking'in
-- düz `.insert()`'ini değiştiriyor — yalnızca anında-onay ilanları için
-- değil, TÜM normal sürücü-ilanı rezervasyonları için (booker_role
-- varsayılan olarak 'passenger'). Eskiden koltuk kontrolü sadece TS
-- tarafında, insert'ten önce yapılıyordu (gerçek bir atomiklik garantisi
-- yok — iki eşzamanlı istek ikisi de kontrolü geçip ikisi de insert
-- edebilirdi). Burada `for update` ile satır kilitlenip kontrol atomik
-- hale geliyor; anında onaysa aynı transaction içinde
-- _apply_booking_approval çağrılıyor (approve_booking'in zaten kullandığı
-- aynı helper, imzası 0062_single_payment_at_settlement.sql'de doğrulandı:
-- p_booking_id uuid, p_ride_id uuid, p_seat_count integer,
-- p_assign_driver_id uuid default null).
create function public.create_booking(p_ride_id uuid, p_seat_count integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
  v_booking_id uuid;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then
    raise exception 'ride_not_found';
  end if;
  if v_ride.status <> 'active' then
    raise exception 'ride_not_active';
  end if;
  if v_ride.driver_id = auth.uid() then
    raise exception 'own_ride';
  end if;
  if v_ride.available_seats < p_seat_count then
    raise exception 'not_enough_seats';
  end if;

  insert into public.bookings (ride_id, passenger_id, seat_count)
  values (p_ride_id, auth.uid(), p_seat_count)
  returning id into v_booking_id;

  if v_ride.instant_booking then
    perform public._apply_booking_approval(v_booking_id, p_ride_id, p_seat_count, null);
  end if;

  return v_booking_id;
end;
$$;
