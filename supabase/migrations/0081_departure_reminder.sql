-- Kullanıcı talebi: "yolculuk yaklaşıyor" hatırlatma e-postası. Resend'in
-- Node SDK'sı Postgres'ten çağrılamadığından (bkz. src/lib/email.ts, tüm
-- e-posta gönderimi app katmanında), gerçek gönderim yeni bir webhook route'ta
-- (src/app/api/cron/departure-reminders/route.ts) yapılıyor — bu migration
-- yalnızca "kime, ne zaman" sorusunu pg_cron + pg_net ile çözüyor.
--
-- Bilinçli mimari karar: SUPABASE_SERVICE_ROLE_KEY kullanılmıyor — proje
-- boyunca (0014_admin.sql, 0075_broadcast_optout_age_gate_account_deletion.sql)
-- service_role'ün bilinçli olarak hiç eklenmediği bir kod tabanı bu. Onun
-- yerine pg_cron zaten var olan complete_past_rides (0011) deseniyle aynı
-- şekilde veritabanı içinde security-definer bir fonksiyonla çalışıyor, ve
-- e-posta göndermek için tek dışa açılan kapı pg_net üzerinden atılan bir
-- webhook çağrısı — PostgREST/anon'a hiç açılmıyor, dolayısıyla yolcu/sürücü
-- e-postaları anon'a sızmıyor.
--
-- app.site_url ve app.cron_secret production'da BİR KEZ elle ayarlanmalı
-- (git'e yazılmaz, Supabase SQL editöründen):
--   alter database postgres set app.site_url = 'https://www.goturbeni.com';
--   alter database postgres set app.cron_secret = '<CRON_SECRET ile aynı, uzun rastgele değer>';
-- Yerel testte doğrulandı: bu komut `postgres` rolüyle "permission denied to
-- set parameter" veriyor — `supabase_admin` rolüyle çalışıyor. Production'da
-- SQL editör hangi rolle bağlanıyorsa onunla dener, permission denied alınırsa
-- supabase_admin ile tekrar denenmeli.
-- CRON_SECRET, Vercel'deki aynı isimli env var ile birebir eşleşmeli —
-- webhook route bu ikisini karşılaştırıyor. İkisi ayarlanmadan fonksiyon
-- hiçbir şey yapmadan döner (aşağıdaki "if ... is null then return" koruması).
create extension if not exists pg_net with schema extensions;

alter table public.rides add column departure_reminder_sent boolean not null default false;

-- Sorgunun taradığı satır kümesini küçük tutar: hatırlatma gönderilmemiş,
-- kalkışı yaklaşan ilanlar. bookings_one_active_per_passenger_ride'daki
-- (0003_bookings.sql) kısmi indeks deseniyle aynı mantık.
create index rides_pending_departure_reminder_idx on public.rides (departure_time)
  where departure_reminder_sent = false;

create function public.send_departure_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_url text := current_setting('app.site_url', true);
  v_cron_secret text := current_setting('app.cron_secret', true);
  v_ride record;
  v_recipients jsonb;
begin
  if v_site_url is null or v_cron_secret is null then
    return;
  end if;

  -- driver_id is not null: yalnızca sürücüsü eşleşmiş (gerçekten yola
  -- çıkacak) ilanlar. Sürücüsü hâlâ bulunamamış yolcu ilanları (0057) için
  -- "yolculuğunuz yaklaşıyor" anlamsız olurdu.
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

-- Günde bir kez, 06:00 UTC (İstanbul saatiyle 09:00) — Vercel Cron'un Hobby
-- planında günde 1 çağrıyla sınırlı olmasından bağımsız olarak çalışır,
-- çünkü tetikleyici burada pg_cron, Vercel Cron değil.
select cron.schedule('send-departure-reminders', '0 6 * * *', $$select public.send_departure_reminders()$$);
