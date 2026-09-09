-- 0081'in tasarım hatasını düzeltiyor: `current_setting('app.site_url'/'app.cron_secret')`
-- production'da hiçbir zaman set edilemezdi. Sebep, o migration'ın yazıldığı
-- sırada yalnızca yerel Docker Supabase'e karşı doğrulanmış olması — yerelde
-- `postgres` rolü tam superuser (Docker container'ın kendi kökü), ama Supabase
-- Cloud'da `postgres` müşteri rolü BİLEREK superuser DEĞİL (`supabase_admin`
-- öyle, ama ona müşteri projelerinden erişilemiyor) — `alter database ... set`
-- bu yüzden production'da "permission denied to set parameter" ile başarısız
-- oluyor (canlıda doğrulandı). GUC yerine düz bir tablo: `postgres` zaten bu
-- tabloya sahip olduğundan INSERT/UPDATE için özel bir yetkiye ihtiyaç yok.
--
-- ride_search_alert_dispatches (0043) ile aynı desen: RLS açık, hiç politika
-- yok — PostgREST/anon/authenticated hiçbir şekilde erişemiyor, yalnızca
-- security-definer fonksiyon (tablo sahibi postgres olduğundan RLS'i
-- otomatik bypass ediyor) okuyup yazabiliyor.
create table public.cron_config (
  key text primary key,
  value text not null
);

alter table public.cron_config enable row level security;

create or replace function public.send_departure_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_url text;
  v_cron_secret text;
  v_ride record;
  v_recipients jsonb;
begin
  select value into v_site_url from public.cron_config where key = 'site_url';
  select value into v_cron_secret from public.cron_config where key = 'cron_secret';

  if v_site_url is null or v_cron_secret is null then
    return;
  end if;

  for v_ride in
    select id, departure_city, arrival_city, driver_id
    from public.rides
    where status in ('active', 'full')
      and departure_reminder_sent = false
      and departure_time > now()
      and departure_time <= now() + interval '24 hours'
      and driver_id is not null
  loop
    update public.rides set departure_reminder_sent = true where id = v_ride.id;

    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_recipients
    from (
      select u.email, p.full_name as name, p.language, 'driver' as role
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id = v_ride.driver_id
      union all
      select u.email, p.full_name as name, p.language, 'passenger' as role
      from public.bookings b
      join public.profiles p on p.id = b.passenger_id
      join auth.users u on u.id = p.id
      where b.ride_id = v_ride.id and b.status = 'approved'
    ) x;

    perform net.http_post(
      url := v_site_url || '/api/cron/departure-reminders',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_cron_secret),
      body := jsonb_build_object(
        'rideId', v_ride.id,
        'departureCity', v_ride.departure_city,
        'arrivalCity', v_ride.arrival_city,
        'recipients', v_recipients
      )
    );
  end loop;
end;
$$;
