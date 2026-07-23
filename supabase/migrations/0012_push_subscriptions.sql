-- Faz 8: push notification altyapısı artık gerçek bir servise (Web Push /
-- VAPID) bağlanıyor. Bu migration yalnızca abonelik depolamasını ve
-- karşı-tarafın aboneliklerini okumak için dar kapsamlı bir RPC'yi ekliyor
-- — gönderim mantığı (web-push kütüphanesi) src/lib/notifications.ts'te.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Sahibi kendi aboneliklerini görebilir/ekleyebilir/silebilir. Başka
-- kimsenin bir kullanıcının push endpoint'ini okuyabilmesi için genel bir
-- SELECT politikası YOK — endpoint+anahtarları bilen biri o tarayıcıya
-- keyfi push gönderebilir, bu yüzden erişim aşağıdaki dar kapsamlı RPC'ye
-- (yalnızca gerçek bir ilan/rezervasyon ilişkisi olan karşı taraf için)
-- taşınıyor.
create policy "select own push subscriptions" on public.push_subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own push subscription" on public.push_subscriptions
  for insert to authenticated
  with check (auth.uid() = user_id);

-- `.upsert(..., { onConflict: "endpoint" })` yeniden abone olma durumunda bir
-- INSERT ... ON CONFLICT DO UPDATE'e derlenir; UPDATE kolu için de bir RLS
-- politikası olmadan üstteki INSERT politikası tek başına yetmez.
create policy "update own push subscription" on public.push_subscriptions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "delete own push subscription" on public.push_subscriptions
  for delete to authenticated
  using (auth.uid() = user_id);

-- Bir ilan üzerinden bildirim gönderen taraf (sürücü ya da rezervasyonu
-- olan bir yolcu), karşı tarafın push aboneliklerini bu fonksiyon
-- üzerinden okuyabilir. `security definer` olduğu için RLS'i bypass eder;
-- bu yüzden ilişkiyi (auth.uid() gerçekten p_ride_id'nin sürücüsü/yolcusu
-- mu, p_recipient_id gerçekten karşı taraf mı) burada tekrar doğruluyor —
-- bookings.sql'deki approve_booking/reject_booking ile aynı desen.
create function public.get_ride_counterparty_push_subscriptions(p_ride_id uuid, p_recipient_id uuid)
returns setof public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and (
        (r.driver_id = auth.uid() and exists (
          select 1 from public.bookings b where b.ride_id = p_ride_id and b.passenger_id = p_recipient_id
        ))
        or (r.driver_id = p_recipient_id and exists (
          select 1 from public.bookings b where b.ride_id = p_ride_id and b.passenger_id = auth.uid()
        ))
      )
  ) then
    return;
  end if;

  return query select * from public.push_subscriptions where user_id = p_recipient_id;
end;
$$;

-- Bir gönderim denemesi 404/410 döndüğünde (tarayıcı aboneliği artık yok —
-- kaldırıldı, izin iptal edildi, endpoint süresi doldu) çağıran taraf ölü
-- kaydı temizleyebilir. Aynı ilişki kontrolü get_ride_counterparty_push_subscriptions
-- ile aynı — bu fonksiyon da karşı tarafın satırına dokunduğu için definer.
create function public.delete_ride_counterparty_push_subscription(p_ride_id uuid, p_recipient_id uuid, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and (
        (r.driver_id = auth.uid() and exists (
          select 1 from public.bookings b where b.ride_id = p_ride_id and b.passenger_id = p_recipient_id
        ))
        or (r.driver_id = p_recipient_id and exists (
          select 1 from public.bookings b where b.ride_id = p_ride_id and b.passenger_id = auth.uid()
        ))
      )
  ) then
    return;
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = p_recipient_id;
end;
$$;
