-- Faz 2B — Faz 2A'da (0057-0059) tasarlanan ama gerçek bir Supabase örneği
-- olmadan test edilemeyen üç eksik burada düzeltiliyor:
--
-- 1) bookings_one_active_per_passenger_ride (0003), (ride_id, passenger_id)
-- üzerinde tanımlıydı — normal rezervasyonlarda passenger_id her zaman farklı
-- bir kişiydi, "aynı yolcu aynı ilana iki kez rezervasyon açamaz" demekti.
-- Bir yolcu ilanına verilen tekliflerde (booker_role='driver') passenger_id
-- HER ZAMAN ilan sahibiyle aynı (teklif veren sürücü değil) — bu yüzden
-- ikinci bir sürücü teklif vermeye çalıştığında bu index'e çarpardı, oysa
-- Faz 2A'nın 0057'deki kendi tasarım yorumu ("aynı ilana birden fazla
-- sürücünün eşzamanlı teklifi") bunun çalışmasını varsayıyordu. İndeks
-- role-scoped hale getiriliyor: passenger_id kısıtı sadece
-- booker_role='passenger' satırlarına uygulanıyor (davranış birebir aynı),
-- driver_id üzerinde YENİ bir kısıt ekleniyor (bir sürücü aynı ilana aynı
-- anda iki teklif veremez, ama farklı sürücüler verebilir).
drop index public.bookings_one_active_per_passenger_ride;

create unique index bookings_one_active_per_passenger_ride on public.bookings (ride_id, passenger_id)
  where status in ('pending', 'approved') and booker_role = 'passenger';

create unique index bookings_one_active_offer_per_driver_ride on public.bookings (ride_id, driver_id)
  where status in ('pending', 'approved') and booker_role = 'driver';

-- 2) cancel_booking (son hâli 0041_no_show_and_late_cancellation.sql'de)
-- sadece passenger_id <> auth.uid() kontrolü yapıyordu — bir yolcu ilanına
-- teklif veren sürücü için passenger_id ilan sahibi olduğundan (driver_id
-- DEĞİL), teklif veren sürücü kendi bekleyen teklifini hiçbir zaman iptal
-- edemiyordu (Faz 2A'nın kendi Self-Review notunda "deferred" diye
-- işaretlenmişti). booker_role='passenger' satırlarında davranış birebir
-- korunuyor.
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
  if v_booking.booker_role = 'driver' then
    if v_booking.driver_id <> auth.uid() then
      raise exception 'not_booking_owner';
    end if;
  else
    if v_booking.passenger_id <> auth.uid() then
      raise exception 'not_booking_owner';
    end if;
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

  update public.bookings
    set status = 'cancelled',
        cancelled_at = now(),
        seat_freed_at = case when v_booking.status = 'approved' then now() else null end
    where id = p_booking_id;

  return v_booking.status = 'approved';
end;
$$;

-- 3) _apply_booking_approval (0059), onay anında payment_status'u koşulsuz
-- 'deposit_confirmed' yapıyordu — normal akışta doğru (sürücü depozitoyu
-- ZATEN aldığı için onaylıyor, "Kaporayı Aldım, Onayla" butonunun kendi
-- anlamı bu). Ama bir yolcu ilanı teklifinde ilan sahibi hangi sürücünün
-- IBAN'ına ödeyeceğini onaydan ÖNCE bilemez (sürücü onay anına kadar
-- belirsiz) — depozito fiilen ONAY SONRASI ödenir. Koşulsuz
-- 'deposit_confirmed' ataması bu durumda parayı hiç hareket etmeden
-- "alındı" sayıyordu ve BookingButton.tsx'in depozito ekranı zaten
-- status='pending' şartına bağlı olduğundan (bkz. src/app/bookings/page.tsx
-- Task 9) o ekran da hiç görünmüyordu. booker_role='driver' satırlarında
-- payment_status artık DOKUNULMUYOR (varsayılan 'awaiting_deposit' kalıyor);
-- booker_role='passenger' satırlarında davranış birebir korunuyor.
create or replace function public._apply_booking_approval(
  p_booking_id uuid,
  p_ride_id uuid,
  p_seat_count integer,
  p_assign_driver_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rides
    set available_seats = available_seats - p_seat_count,
        status = case when available_seats - p_seat_count = 0 then 'full' else status end,
        driver_id = coalesce(p_assign_driver_id, driver_id)
    where id = p_ride_id;

  update public.bookings
    set status = 'approved',
        payment_status = case when booker_role = 'driver' then payment_status else 'deposit_confirmed' end
    where id = p_booking_id;

  insert into public.booking_pickup_codes (booking_id, code)
  values (p_booking_id, lpad(floor(random() * 10000)::text, 4, '0'))
  on conflict (booking_id) do nothing;
end;
$$;
