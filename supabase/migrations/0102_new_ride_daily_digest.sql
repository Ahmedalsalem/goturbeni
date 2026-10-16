-- Kullanıcı kararı (2026-10-16): her yeni ilanda tüm üyelere ayrı bir e-posta
-- (0067) yerine günde bir özet. İlan başına yayın, üye sayısı × ilan sayısı
-- kadar e-posta demekti ve e-posta sağlayıcısının günlük limitini (ücretsiz
-- planda 100) iki ilanla dolduruyordu; özet üye başına günde en fazla bir
-- e-posta. Kayıtlı arama uyarıları (0043) anlık kalıyor.
--
-- send_departure_reminders (0082) ile aynı desen: pg_cron günde bir kez
-- çağırır, fonksiyon ilanları ve alıcıları toplayıp pg_net ile
-- /api/cron/new-ride-digest'e gönderir (render + gönderim Node tarafında).
-- ride_broadcast_dispatches (0067) "bu ilan zaten duyuruldu" kaydı olarak
-- kalıyor, böylece bir ilan iki özete girmiyor.
create or replace function public.send_new_ride_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_url text;
  v_cron_secret text;
  v_rides jsonb;
  v_recipients jsonb;
begin
  select value into v_site_url from public.cron_config where key = 'site_url';
  select value into v_cron_secret from public.cron_config where key = 'cron_secret';

  if v_site_url is null or v_cron_secret is null then
    return;
  end if;

  with fresh as (
    select r.id
    from public.rides r
    where r.status = 'active'
      and r.departure_time > now()
      and r.created_at > now() - interval '2 days'
      and not exists (select 1 from public.ride_broadcast_dispatches d where d.ride_id = r.id)
  ), marked as (
    insert into public.ride_broadcast_dispatches (ride_id)
    select id from fresh
    on conflict (ride_id) do nothing
    returning ride_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'departureCity', r.departure_city,
      'arrivalCity', r.arrival_city,
      'departureTime', r.departure_time,
      'postedByRole', r.posted_by_role,
      'postedBy', r.posted_by
    ) order by r.departure_time), '[]'::jsonb)
  into v_rides
  from marked m
  join public.rides r on r.id = m.ride_id;

  if jsonb_array_length(v_rides) = 0 then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'userId', p.id,
      'email', u.email,
      'language', p.language
    )), '[]'::jsonb)
  into v_recipients
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.profiles_private pp on pp.id = p.id
  where p.deleted_at is null
    and coalesce(pp.email_notifications_enabled, true)
    and coalesce(pp.email_verified, false);

  perform net.http_post(
    url := v_site_url || '/api/cron/new-ride-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_cron_secret),
    body := jsonb_build_object('rides', v_rides, 'recipients', v_recipients)
  );
end;
$$;

-- Fonksiyonlar varsayılan olarak PUBLIC'e EXECUTE ile açılıyor; PostgREST
-- üzerinden anon'un toplu e-posta tetikleyebilmesini engelle.
revoke execute on function public.send_new_ride_digest() from public, anon, authenticated;

-- 15:00 UTC = 18:00 İstanbul.
select cron.schedule('send-new-ride-digest', '0 15 * * *', $$select public.send_new_ride_digest()$$);

-- İlan başına yayının tek çağıranı (createRide) kaldırıldı.
drop function public.get_all_member_emails_for_broadcast(uuid);
