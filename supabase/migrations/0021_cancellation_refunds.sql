-- İptal + iade kontrol mekanizması: bir sürücü, ödemesi zaten alınmış
-- (deposit_confirmed/settled) bir rezervasyonu olan ilanı iptal ederse
-- sistem otomatik olarak bir iade süreci başlatır — sürücünün iadeyi
-- yaptığını gösteren dekontu yüklemesi ve bunun admin tarafından
-- denetlenmesi beklenir. Ödeme hiç alınmamış rezervasyonlar (awaiting_deposit)
-- iade gerektirmeden doğrudan iptal edilir.

create type public.refund_status as enum ('not_applicable', 'pending', 'proof_submitted', 'confirmed');

alter table public.bookings
  add column refund_status public.refund_status not null default 'not_applicable',
  add column refund_proof_url text,
  add column refund_requested_at timestamptz,
  add column refund_confirmed_at timestamptz;

-- rides/actions.ts'teki cancelRide artık doğrudan bir `.update()` yerine bu
-- RPC'yi çağırır (0002_rides.sql'deki "update own ride" politikası zaten
-- yalnızca status='active' iken izin veriyordu — RPC aynı kısıtlamayı
-- security definer içinde tekrarlar ve ek olarak bookings'i de günceller,
-- ki bunu client tarafından ayrı bir çağrıyla yapmak atomik olmazdı).
create function public.cancel_ride_with_bookings(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id and driver_id = auth.uid() for update;
  if not found then
    raise exception 'not_authorized';
  end if;
  if v_ride.status not in ('active', 'full') then
    raise exception 'ride_not_cancellable';
  end if;

  update public.rides set status = 'cancelled' where id = p_ride_id;

  -- Ödemesi alınmış (deposit_confirmed/settled) onaylı rezervasyonlar iade
  -- sürecine girer; henüz ödeme alınmamışsa (awaiting_deposit) veya talep
  -- hâlâ beklemedeyse doğrudan iptal edilir, iade gerekmez.
  update public.bookings
    set status = 'cancelled',
        refund_status = 'pending',
        refund_requested_at = now()
    where ride_id = p_ride_id
      and status = 'approved'
      and payment_status in ('deposit_confirmed', 'settled');

  update public.bookings
    set status = 'cancelled'
    where ride_id = p_ride_id
      and status in ('pending', 'approved')
      and payment_status = 'awaiting_deposit';
end;
$$;

-- Sürücü, iade ettiğini gösteren dekontu yükler. Yalnızca kendi ilanının
-- rezervasyonu için ve refund_status zaten 'pending'/'proof_submitted' iken
-- (yeniden yükleme reddedilen bir kanıtı düzeltebilsin diye izinli).
create function public.submit_refund_proof(p_booking_id uuid, p_receipt_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings b
    set refund_proof_url = p_receipt_url,
        refund_status = 'proof_submitted'
    from public.rides r
    where b.id = p_booking_id
      and r.id = b.ride_id
      and r.driver_id = auth.uid()
      and b.refund_status in ('pending', 'proof_submitted');

  if not found then
    raise exception 'not_authorized';
  end if;
end;
$$;

-- Admin, sürücünün yüklediği iade dekontunu inceleyip iadeyi onaylar.
create function public.admin_confirm_refund(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.bookings
    set refund_status = 'confirmed',
        refund_confirmed_at = now()
    where id = p_booking_id and refund_status = 'proof_submitted';

  if not found then
    raise exception 'refund_not_ready';
  end if;
end;
$$;
