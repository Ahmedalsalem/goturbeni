-- Kullanıcı talebi: "bu güzergahta ilan açılınca haber ver" — aradığı
-- güzergahta ilan bulamayan kullanıcı bir abonelik oluşturabilsin. Karar
-- (kullanıcı onayıyla): yalnızca TAM şehir eşleşmesi — arama sayfasındaki
-- "yakın il" esnekliği (0032) burada kasıtlı olarak kullanılmıyor, aksi
-- halde Ankara→İstanbul aboneliği istenmeyen bir Ankara→Kocaeli ilanı için
-- de bildirim gönderebilirdi.
create table public.ride_search_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  departure_city text not null,
  arrival_city text not null,
  created_at timestamptz not null default now(),
  unique (user_id, departure_city, arrival_city)
);

create index ride_search_alerts_route_idx on public.ride_search_alerts (departure_city, arrival_city);

alter table public.ride_search_alerts enable row level security;

create policy "select own search alerts" on public.ride_search_alerts
  for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own search alerts" on public.ride_search_alerts
  for insert to authenticated
  with check (auth.uid() = user_id);

-- .upsert(..., { onConflict: "user_id,departure_city,arrival_city" })
-- (createSearchAlert, src/features/search-alerts/actions.ts) needs this for
-- the same reason ride_waitlist does (see 0040) — the ON CONFLICT DO UPDATE
-- arm is gated by an UPDATE policy, not the INSERT one.
create policy "update own search alerts" on public.ride_search_alerts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own search alerts" on public.ride_search_alerts
  for delete to authenticated
  using (auth.uid() = user_id);

-- Bir ilanın eşleşen abonelere BİR KEZ (ilan başına, hayatı boyunca en fazla
-- bir kez) bildirim gönderdiğini işaretlemek için — bunu `rides` tablosunda
-- bir kolon olarak tutmak YETERSİZ: `rides`'ın kendi "update own ride"
-- politikası (0002_rides.sql) sürücünün aktif ilanındaki HERHANGİ bir kolonu
-- (bu kolon dahil) doğrudan .update() ile değiştirmesine izin veriyor —
-- yani sürücü bayrağı kendisi sıfırlayıp RPC'yi tekrar tekrar çağırabilirdi,
-- "en fazla bir kez" garantisini boşa çıkarırdı. Bunun yerine ayrı, hiçbir
-- INSERT/UPDATE/DELETE politikası olmayan bir tabloda tutuluyor — tıpkı
-- bookings'in (0003_bookings.sql) hiç UPDATE politikası olmaması gibi,
-- RLS etkinken politika yoksa authenticated/anon için varsayılan tümüyle
-- ret demek; satır yalnızca bu güvenlik-tanımlı (security definer)
-- fonksiyon üzerinden yazılabiliyor.
create table public.ride_search_alert_dispatches (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  notified_at timestamptz not null default now()
);

alter table public.ride_search_alert_dispatches enable row level security;

-- Tek bir RPC (push abonelikleri + e-posta bir arada) — iki ayrı RPC
-- (biri push biri e-posta) "yalnızca bir kez" bayrağını yarışarak tüketirse,
-- ikinci çağrı hiçbir şey döndürmeyip o kanalı sessizce atlardı.
create function public.get_search_alert_recipients(p_ride_id uuid)
returns table (user_id uuid, email text, endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  -- Aynı ilan için eşzamanlı iki çağrının ikisinin de "henüz yok" görüp
  -- ikisinin de eklemeye çalışmasını önlemek için ilan satırı kilitleniyor
  -- (ride_search_alert_dispatches'te henüz satır yokken kilitlenecek bir
  -- satır olmadığından, kilit bunun yerine rides üzerinden alınıyor).
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
    select a.user_id, u.email, ps.endpoint, ps.p256dh, ps.auth
    from public.ride_search_alerts a
    join auth.users u on u.id = a.user_id
    left join public.push_subscriptions ps on ps.user_id = a.user_id
    where a.departure_city = v_ride.departure_city
      and a.arrival_city = v_ride.arrival_city
      and a.user_id <> v_ride.driver_id;
end;
$$;
