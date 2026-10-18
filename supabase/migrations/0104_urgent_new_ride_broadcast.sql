-- 0102'deki günlük özet, kalkışı bir sonraki özetten (18:00) önce olan
-- ilanları hiç duyurmuyordu: özet yalnızca kalkışı geçmemiş ilanları alıyor,
-- yani akşam açılıp ertesi sabah kalkan ilan hiçbir özete girmiyordu (prod,
-- 2026-10-17 21:46'da açılan Şanlıurfa → Diyarbakır ilanı). Kullanıcı kararı
-- (2026-10-18): böyle "acil" ilanlar açıldığı anda tek başına aynı özet
-- e-postasıyla gitsin, gerisi 18:00 özetinde kalsın.
--
-- Gönderim post_new_ride_digest'e taşındı ki özet ve acil yayın aynı
-- alıcı/işaretleme mantığını paylaşsın; ride_broadcast_dispatches sayesinde
-- acil yayınlanan ilan akşam özetine tekrar girmiyor.
create or replace function public.post_new_ride_digest(p_ride_ids uuid[])
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
    where r.id = any(p_ride_ids)
      and r.status = 'active'
      and r.departure_time > now()
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

create or replace function public.send_new_ride_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.post_new_ride_digest(array(
    select r.id
    from public.rides r
    where r.status = 'active'
      and r.departure_time > now()
      and r.created_at > now() - interval '2 days'
      and not exists (select 1 from public.ride_broadcast_dispatches d where d.ride_id = r.id)
  ));
end;
$$;

-- Bir sonraki özet: bugün 15:00 UTC (= 18:00 İstanbul, 0102'deki cron), o
-- saat geçtiyse yarın 15:00 UTC. Cron saati değişirse burası da değişmeli.
create function public.broadcast_urgent_new_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_digest timestamptz;
begin
  v_next_digest := (date_trunc('day', now() at time zone 'UTC') + interval '15 hours') at time zone 'UTC';
  if v_next_digest <= now() then
    v_next_digest := v_next_digest + interval '1 day';
  end if;

  if new.status = 'active' and new.departure_time > now() and new.departure_time <= v_next_digest then
    perform public.post_new_ride_digest(array[new.id]);
  end if;
  return null;
end;
$$;

create trigger rides_broadcast_urgent_new_ride
  after insert on public.rides
  for each row execute function public.broadcast_urgent_new_ride();

revoke execute on function public.post_new_ride_digest(uuid[]) from public, anon, authenticated;
revoke execute on function public.broadcast_urgent_new_ride() from public, anon, authenticated;
