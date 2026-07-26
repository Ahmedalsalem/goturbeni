-- 0028'de eklenen enum değeri aynı transaction içinde kullanılamıyor
-- (Postgres kısıtı: "unsafe use of new value of enum type") — bu yüzden
-- fonksiyonu kullanan değişiklik ayrı bir migration'da.
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

  -- Hesap 48 saatten yeni VE ₺300+ masraf paylı bir ilan açmış — "sahte
  -- ilan ver, depozito topla, kaybol" paterninin en erken yakalanabilir hali;
  -- tek bir ilan bile yeterli sinyal (diğer kurallar tekrar arıyor, bu aramıyor).
  select distinct r.driver_id, p.full_name, coalesce(af.is_suspended, false), 'new_account_high_value'::public.suspicious_account_reason,
         'Üye: ' || to_char(p.created_at, 'DD.MM.YYYY') || ', ilan: ₺' || r.cost_share::text
  from public.rides r
  join public.profiles p on p.id = r.driver_id
  left join public.admin_flags af on af.id = r.driver_id
  where p.created_at >= now() - interval '48 hours'
    and r.cost_share >= 300;
end;
$$;
