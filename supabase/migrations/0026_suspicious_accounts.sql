-- Otomatik dolandırıcılık/kötüye kullanım tespiti — bu bir ML sistemi değil,
-- mevcut rides/bookings verisinden dört basit kural türeten bir "admin
-- panelinde şüpheli hesapları işaretle" özelliği (v1). Eşikler makul
-- varsayımlarla seçildi, gerçek kullanım verisiyle ayarlanması gerekebilir
-- — bkz. README → Bilinen Sınırlamalar.
--
-- Kurallar:
-- (A) ride_spam: aynı sürücü son 24 saatte 5+ ilan oluşturmuş.
-- (B) high_cancellation_rate: sürücünün toplam 3+ ilanının %50+'si iptal edilmiş.
-- (C) high_rejection_rate: sürücü 5+ rezervasyon talebi almış, %70+'ini reddetmiş.
-- (D) booking_spam: aynı yolcu son 7 günde 8+ rezervasyon talebi oluşturmuş.
create type public.suspicious_account_reason as enum ('ride_spam', 'high_cancellation_rate', 'high_rejection_rate', 'booking_spam');

create function public.admin_get_suspicious_accounts()
returns table (user_id uuid, full_name text, is_suspended boolean, reason public.suspicious_account_reason, detail text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'ride_spam'::public.suspicious_account_reason,
         count(*)::text || ' ilan / son 24 saat'
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  where r.created_at >= now() - interval '24 hours'
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 5

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'high_cancellation_rate'::public.suspicious_account_reason,
         round(100.0 * count(*) filter (where r.status = 'cancelled') / count(*))::text || '% iptal (' || count(*) || ' ilan)'
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 3 and count(*) filter (where r.status = 'cancelled') >= count(*) * 0.5

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'high_rejection_rate'::public.suspicious_account_reason,
         round(100.0 * count(*) filter (where b.status = 'rejected') / count(*))::text || '% red (' || count(*) || ' talep)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 5 and count(*) filter (where b.status = 'rejected') >= count(*) * 0.7

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'booking_spam'::public.suspicious_account_reason,
         count(*)::text || ' rezervasyon talebi / son 7 gün'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.id = b.passenger_id
  where b.created_at >= now() - interval '7 days'
  group by b.passenger_id, p.full_name, af.is_suspended
  having count(*) >= 8;
end;
$$;
