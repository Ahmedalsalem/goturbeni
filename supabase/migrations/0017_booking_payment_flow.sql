-- Komisyonsuz, doğrudan-şahıslar-arası "yarı başta / yarı sonda" ödeme takip
-- akışı. Gerçek bir ödeme altyapısına (iyzico/Stripe vb.) bağlanmıyor —
-- yalnızca sürücünün IBAN'ının yolcuya güvenli şekilde gösterilmesi ve iki
-- tarafın manuel "aldım / tamamlandı" onaylarının kaydı.

create type public.booking_payment_status as enum ('awaiting_deposit', 'deposit_confirmed', 'settled');

alter table public.bookings
  add column payment_status public.booking_payment_status not null default 'awaiting_deposit',
  add column deposit_deadline_at timestamptz not null default (now() + interval '1 hour'),
  add column driver_settled_at timestamptz,
  add column passenger_settled_at timestamptz;

-- Sürücünün "İlk Yarı Ödemesini Aldım" butonu, var olan approve_booking
-- akışını yeniden kullanır (yeni bir buton/RPC değil, aynı pending -> approved
-- geçişi artık payment_status'u da 'deposit_confirmed'e taşıyor).
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
end;
$$;

-- Yolcunun, aktif bir rezervasyonu olduğu ilanın sürücüsüne ait IBAN'ını
-- okumasını sağlar. profiles_private normalde yalnızca sahibi tarafından
-- okunabilir (0006); bu `security definer` fonksiyon, ilişkiyi (çağıran
-- gerçekten bu ilana pending/approved bir rezervasyonu olan yolcu mu)
-- doğruladıktan sonra yalnızca sürücünün IBAN'ını dar kapsamlı olarak açar
-- — get_ride_counterparty_push_subscriptions ile aynı yetkilendirme deseni
-- (bkz. 0012_push_subscriptions.sql).
create function public.get_ride_driver_payment_info(p_ride_id uuid)
returns table (iban text, iban_holder_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.bookings b
    where b.ride_id = p_ride_id
      and b.passenger_id = auth.uid()
      and b.status in ('pending', 'approved')
  ) then
    raise exception 'not_authorized';
  end if;

  return query
    select pp.iban, pp.iban_holder_name
    from public.rides r
    join public.profiles_private pp on pp.id = r.driver_id
    where r.id = p_ride_id;
end;
$$;

-- Yolculuk sonrası her iki taraf da kendi "Kalan Ödeme Tamamlandı" onayını
-- ayrı ayrı verir; ikisi de verdiğinde payment_status 'settled'e geçer.
-- "Yolculuk tamamlandı mı" kontrolü ride.status'un pg_cron'un dakikalık
-- gecikmesini beklemesi yerine departure_time < now() karşılaştırmasını
-- kullanır — bookings/reviews tarafında zaten kullanılan aynı desen (bkz.
-- README → "Tamamlandı nasıl hesaplanıyor?", 0011_ride_auto_complete.sql).
create function public.confirm_remaining_payment(p_booking_id uuid)
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
  if v_booking.status <> 'approved' then
    raise exception 'booking_not_approved';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;
  if v_ride.departure_time >= now() then
    raise exception 'ride_not_completed';
  end if;

  if auth.uid() = v_ride.driver_id then
    update public.bookings set driver_settled_at = now() where id = p_booking_id;
  elsif auth.uid() = v_booking.passenger_id then
    update public.bookings set passenger_settled_at = now() where id = p_booking_id;
  else
    raise exception 'not_authorized';
  end if;

  update public.bookings
    set payment_status = 'settled'
    where id = p_booking_id and driver_settled_at is not null and passenger_settled_at is not null;
end;
$$;

-- update_own_profile'a IBAN alanlarını ekler. Parametre listesi değiştiği
-- için (yeni zorunlu parametreler) `create or replace` eski imzayı
-- değiştirmez, yeni bir overload oluşturur — bu yüzden önce eski imza
-- açıkça düşürülür.
drop function public.update_own_profile(text, text, text, text, text);

create function public.update_own_profile(
  p_full_name text,
  p_bio text,
  p_language text,
  p_avatar_url text,
  p_phone text,
  p_iban text,
  p_iban_holder_name text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles
    set full_name = p_full_name,
        bio = p_bio,
        language = p_language,
        avatar_url = coalesce(p_avatar_url, avatar_url)
    where id = auth.uid();

  insert into public.profiles_private (id, phone, phone_verified, iban, iban_holder_name)
  values (auth.uid(), p_phone, false, p_iban, p_iban_holder_name)
  on conflict (id) do update
    set phone = excluded.phone,
        phone_verified = case
          when profiles_private.phone is distinct from excluded.phone then false
          else profiles_private.phone_verified
        end,
        iban = excluded.iban,
        iban_holder_name = excluded.iban_holder_name;
end;
$$;

-- Kayıt akışında cinsiyet + telefonu tek seferde kaydeder (telefon her
-- zaman doğrulanmamış olarak başlar — gerçek OTP gönderimi, mevcut
-- sendPhoneVerificationCode akışıyla ayrıca tetiklenir, bkz.
-- src/features/auth/actions.ts).
create function public.complete_registration_details(p_gender text, p_phone text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.profiles_private (id, gender, phone, phone_verified)
  values (auth.uid(), p_gender::public.profile_gender, p_phone, false)
  on conflict (id) do update
    set gender = excluded.gender,
        phone = excluded.phone,
        phone_verified = false;
end;
$$;
