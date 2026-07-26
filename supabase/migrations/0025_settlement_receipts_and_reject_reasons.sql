-- Üç madde:
-- (1) Kalan ödeme (yolculuk sonrası "yarı") için de deposit ile aynı
--     dekont-yükle + admin-incele akışı — önceden yalnızca ilk yarı
--     (deposit) için vardı, kalan ödeme yalnızca karşılıklı buton onayına
--     (confirm_remaining_payment) dayanıyordu.
-- (2) Reddedilen dekont/iade için admin'in bir gerekçe girebilmesi ve bunun
--     ilgili tarafa gösterilmesi.
-- (3) Admin'in, bekleyen bir deposit dekontunu incelerken sürücünün
--     IBAN/IBAN sahibi adını görüp dekonttaki adla göz kontrolü
--     yapabilmesi (gerçek banka API doğrulaması yerine ara çözüm).

alter table public.bookings
  add column settlement_receipt_url text,
  add column settlement_receipt_status public.receipt_status,
  add column settlement_receipt_reviewed_at timestamptz,
  add column deposit_receipt_reject_reason text,
  add column settlement_receipt_reject_reason text,
  add column refund_reject_reason text;

-- Yolcu, kalan (ikinci yarı) ödemenin IBAN'a yapıldığını gösteren dekontu
-- yükler. submit_deposit_receipt ile aynı desen; ek olarak yolculuğun
-- gerçekten tamamlanmış olması gerekir (0017'deki confirm_remaining_payment
-- ile aynı departure_time < now() kontrolü). Yeniden yüklemede önceki bir
-- red gerekçesi temizlenir.
create function public.submit_settlement_receipt(p_booking_id uuid, p_receipt_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
begin
  select * into v_booking from public.bookings where id = p_booking_id and passenger_id = auth.uid();
  if not found then
    raise exception 'not_authorized';
  end if;
  if v_booking.status <> 'approved' then
    raise exception 'booking_not_approved';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;
  if v_ride.departure_time >= now() then
    raise exception 'ride_not_completed';
  end if;

  update public.bookings
    set settlement_receipt_url = p_receipt_url,
        settlement_receipt_status = 'pending',
        settlement_receipt_reviewed_at = null,
        settlement_receipt_reject_reason = null
    where id = p_booking_id;
end;
$$;

-- Admin, kalan ödeme dekontunu onaylar/reddeder — admin_review_deposit_receipt
-- ile aynı desen, reddedilirse gerekçe kaydedilir.
create function public.admin_review_settlement_receipt(p_booking_id uuid, p_approved boolean, p_reason text default null)
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
    set settlement_receipt_status = (case when p_approved then 'approved' else 'rejected' end)::receipt_status,
        settlement_receipt_reviewed_at = now(),
        settlement_receipt_reject_reason = case when p_approved then null else p_reason end
    where id = p_booking_id and settlement_receipt_url is not null;

  if not found then
    raise exception 'receipt_not_found';
  end if;
end;
$$;

-- admin_review_deposit_receipt'e gerekçe parametresi eklenir. Parametre
-- listesi değiştiği için (0009/0017/0018'deki update_own_profile'da olduğu
-- gibi) önce eski iki-parametreli imza düşürülür — aksi halde PostgREST,
-- yalnızca p_booking_id/p_approved ile çağrıldığında iki overload arasında
-- "could not choose the best candidate function" hatasıyla belirsizliğe düşer.
drop function public.admin_review_deposit_receipt(uuid, boolean);

create function public.admin_review_deposit_receipt(p_booking_id uuid, p_approved boolean, p_reason text default null)
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
    set deposit_receipt_status = (case when p_approved then 'approved' else 'rejected' end)::receipt_status,
        deposit_receipt_reviewed_at = now(),
        deposit_receipt_reject_reason = case when p_approved then null else p_reason end
    where id = p_booking_id and deposit_receipt_url is not null;

  if not found then
    raise exception 'receipt_not_found';
  end if;
end;
$$;

-- submit_deposit_receipt yeniden yüklemede önceki red gerekçesini de temizler.
create or replace function public.submit_deposit_receipt(p_booking_id uuid, p_receipt_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
    set deposit_receipt_url = p_receipt_url,
        deposit_receipt_status = 'pending',
        deposit_receipt_reviewed_at = null,
        deposit_receipt_reject_reason = null
    where id = p_booking_id and passenger_id = auth.uid();

  if not found then
    raise exception 'not_authorized';
  end if;
end;
$$;

-- Admin, sürücünün yüklediği iade kanıtını reddedebilir (önceden yalnızca
-- onaylama vardı — admin_confirm_refund). refund_status 'pending'e döner,
-- böylece sürücü submit_refund_proof ile yeniden yükleyebilir (0021'deki
-- "pending"/"proof_submitted" koşulu zaten bunu izin veriyordu).
create function public.admin_reject_refund_proof(p_booking_id uuid, p_reason text default null)
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
    set refund_status = 'pending',
        refund_reject_reason = p_reason
    where id = p_booking_id and refund_status = 'proof_submitted';

  if not found then
    raise exception 'refund_not_ready';
  end if;
end;
$$;

-- submit_refund_proof yeniden yüklemede önceki red gerekçesini temizler.
create or replace function public.submit_refund_proof(p_booking_id uuid, p_receipt_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings b
    set refund_proof_url = p_receipt_url,
        refund_status = 'proof_submitted',
        refund_reject_reason = null
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

-- Admin'in, bekleyen bir dekont incelemesi sırasında sürücünün IBAN'ını
-- görebilmesi (profiles_private normalde yalnızca sahibine açık, admin
-- bypass'ı yok — bkz. 0006/0014). get_ride_driver_payment_info ile aynı
-- desen, ama yolcu-sürücü ilişkisi yerine is_admin() ile korunur.
create function public.admin_get_driver_payment_info(p_booking_id uuid)
returns table (iban text, iban_holder_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select pp.iban, pp.iban_holder_name
    from public.bookings b
    join public.rides r on r.id = b.ride_id
    join public.profiles_private pp on pp.id = r.driver_id
    where b.id = p_booking_id;
end;
$$;
