-- Kullanıcı isteği: e-posta adresini doğrulamamış hesaplara artık toplu
-- e-posta gitmesin. Doğrulanmamış adresler büyük ihtimalle yanlış yazılmış
-- ya da terk edilmiş — bunlara gönderim bounce/spam şikâyeti olarak alan
-- adının itibarını düşürüyor. Doğrulama kodu e-postaları bu RPC'lerden
-- geçmediği için etkilenmiyor.

-- Yeni ilan yayını (son hâli 0075).
create or replace function public.get_all_member_emails_for_broadcast(p_ride_id uuid)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id and posted_by = auth.uid();
  if not found then
    return;
  end if;

  insert into public.ride_broadcast_dispatches (ride_id) values (p_ride_id)
  on conflict (ride_id) do nothing;
  if not found then
    return;
  end if;

  return query
    select p.id, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles_private pp on pp.id = p.id
    where p.id <> v_ride.posted_by
      and p.deleted_at is null
      and coalesce(pp.email_notifications_enabled, true)
      and coalesce(pp.email_verified, false);
end;
$$;

-- Admin "Hatırlat" (0095).
create or replace function public.admin_get_ride_reminder_recipients(p_ride_id uuid)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if not found then
    raise exception 'ride_not_found';
  end if;

  return query
    select p.id, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles_private pp on pp.id = p.id
    where p.id <> v_ride.posted_by
      and p.deleted_at is null
      and coalesce(pp.email_notifications_enabled, true)
      and coalesce(pp.email_verified, false);
end;
$$;

-- Arama uyarısı (0043): push bildirimi doğrulanmamış hesaplara da gitmeye
-- devam ediyor, yalnızca e-posta null dönüyor (uygulama null e-postayı
-- atlıyor, bkz. src/lib/search-alert-notifications.ts).
create or replace function public.get_search_alert_recipients(p_ride_id uuid)
returns table (user_id uuid, email text, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id and driver_id = auth.uid() for update;
  if not found then
    return;
  end if;

  insert into public.ride_search_alert_dispatches (ride_id) values (p_ride_id)
  on conflict (ride_id) do nothing;
  if not found then
    return;
  end if;

  return query
    select a.user_id,
           case when coalesce(pp.email_verified, false) then u.email::text end,
           ps.endpoint, ps.p256dh, ps.auth
    from public.ride_search_alerts a
    join auth.users u on u.id = a.user_id
    left join public.profiles_private pp on pp.id = a.user_id
    left join public.push_subscriptions ps on ps.user_id = a.user_id
    where a.departure_city = v_ride.departure_city
      and a.arrival_city = v_ride.arrival_city
      and a.user_id <> v_ride.driver_id;
end;
$$;
