-- Kural-tabanlı dolandırıcılık tespiti v2: önceki 7 kurala (0026, 0028/0029,
-- 0042) 3 yeni sinyal ekler. Hâlâ bir ML sistemi değil — README'nin kendi
-- ifadesiyle "kesin kanıt değil, işaret"; eşikler gerçek kullanım verisiyle
-- ayarlanmalı.
create or replace function public.admin_get_suspicious_accounts()
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
  having count(*) >= 8

  union all

  select distinct r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'new_account_high_value'::public.suspicious_account_reason,
         'Üye: ' || to_char(p.created_at, 'DD.MM.YYYY') || ', ilan: ₺' || r.cost_share::text
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  where p.created_at >= now() - interval '48 hours'
    and r.cost_share >= 300

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_late_cancellation'::public.suspicious_account_reason,
         count(*)::text || ' geç iptal (kalkışa <2 saat kala)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.id = b.passenger_id
  where b.status = 'cancelled' and b.cancelled_at is not null
    and r.departure_time - b.cancelled_at < interval '2 hours'
  group by b.passenger_id, p.full_name, af.is_suspended
  having count(*) >= 2

  union all

  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_passenger_no_show'::public.suspicious_account_reason,
         count(*)::text || ' no-show (yolcu gelmedi)'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.id = b.passenger_id
  where b.passenger_no_show
  group by b.passenger_id, p.full_name, af.is_suspended
  having count(*) >= 2

  union all

  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'frequent_driver_no_show'::public.suspicious_account_reason,
         count(*)::text || ' no-show (sürücü gelmedi)'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  where b.driver_no_show
  group by r.driver_id, p.full_name, af.is_suspended
  having count(*) >= 2

  union all

  -- Aynı IBAN birden fazla farklı hesapta kayıtlı — klasik hesap-çiftlik
  -- (account farming) sinyali. profiles_private normalde yalnızca sahibine
  -- açık (RLS), ama bu fonksiyon security definer olduğu için bypass eder.
  select pp.id, p.full_name, coalesce(af.is_suspended, false), 'duplicate_iban'::public.suspicious_account_reason,
         'Aynı IBAN ' || dup.account_count::text || ' hesapta kayıtlı'
  from public.profiles_private pp
  join public.profiles p on p.id = pp.id
  left join public.admin_flags af on af.id = pp.id
  join (
    select iban, count(*) as account_count
    from public.profiles_private
    where iban is not null
    group by iban
    having count(*) > 1
  ) dup on dup.iban = pp.iban

  union all

  -- İki kullanıcı arasında yön farketmeksizin tekrar eden şikayet konusu
  -- olma — disputes.against_user_id (0044_disputes.sql). Reddedilmiş
  -- (dismissed) anlaşmazlıklar sayılmaz, açık/incelenen/çözülen sayılır.
  select d.against_user_id, p.full_name, coalesce(af.is_suspended, false), 'disputed_repeatedly'::public.suspicious_account_reason,
         count(*)::text || ' anlaşmazlıkta şikayet edilen taraf'
  from public.disputes d
  join public.profiles p on p.id = d.against_user_id
  left join public.admin_flags af on af.id = d.against_user_id
  where d.status <> 'dismissed'
  group by d.against_user_id, p.full_name, af.is_suspended
  having count(*) >= 2

  union all

  -- Tekrarlayan dekont reddi — yolcu tarafı (deposit + settlement,
  -- 0045'teki *_reject_count kolonları, ömür boyu sayaç).
  select b.passenger_id, p.full_name, coalesce(af.is_suspended, false), 'repeated_receipt_rejection'::public.suspicious_account_reason,
         sum(b.deposit_receipt_reject_count + b.settlement_receipt_reject_count)::text || ' reddedilen dekont'
  from public.bookings b
  join public.profiles p on p.id = b.passenger_id
  left join public.admin_flags af on af.id = b.passenger_id
  group by b.passenger_id, p.full_name, af.is_suspended
  having sum(b.deposit_receipt_reject_count + b.settlement_receipt_reject_count) >= 3

  union all

  -- Tekrarlayan iade kanıtı reddi — sürücü tarafı.
  select r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'repeated_receipt_rejection'::public.suspicious_account_reason,
         sum(b.refund_reject_count)::text || ' reddedilen iade kanıtı'
  from public.bookings b
  join public.rides r on r.id = b.ride_id
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  group by r.driver_id, p.full_name, af.is_suspended
  having sum(b.refund_reject_count) >= 3;
end;
$$;
