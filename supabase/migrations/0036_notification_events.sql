-- Nav-level "yeni bir şey var" rozeti: kullanıcı bir push bildirimi
-- almadan önce/sonra bile, "Rezervasyonlarım" (my_bookings) ve "İlanlarım"
-- (my_rides) menü öğelerinin kırmızı bir noktayla işaretlenebilmesi için
-- kalıcı bir "okunmadı" durumu gerekiyor — önceden bunun karşılığı yoktu
-- (yalnızca messages.read_at vardı, o da sohbete özel). Bu tablo, mevcut
-- push/email bildirim olaylarının (booking_requested/approved/rejected)
-- yanına ekleniyor, yeni bir kanal değil.

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  ride_id uuid not null references public.rides (id) on delete cascade,
  nav_target text not null check (nav_target in ('my_rides', 'my_bookings')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Rozet sorgusu her sayfa yüklemesinde "var mı yok mu" kontrolü yapıyor
-- (bkz. getUnreadNavBadges) — partial index sadece okunmamışları kapsıyor.
create index notification_events_unread_idx
  on public.notification_events (recipient_id, nav_target)
  where read_at is null;

alter table public.notification_events enable row level security;

create policy "select own notification events" on public.notification_events
  for select to authenticated
  using (auth.uid() = recipient_id);

-- "Okundu" işaretleme, satırın sahibi (recipient) tarafından doğrudan UPDATE
-- ile yapılıyor (bkz. markNavNotificationsRead) — push_subscriptions'taki
-- update politikasıyla aynı desen.
create policy "update own notification events" on public.notification_events
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- INSERT için kasıtlı olarak bir RLS politikası YOK: olayı tetikleyen taraf
-- (ör. rezervasyonu onaylayan sürücü), KARŞI tarafın (yolcunun) satırını
-- oluşturuyor — "kendi satırını ekle" politikasıyla ifade edilemez. Bu yüzden
-- ekleme yalnızca aşağıdaki security definer fonksiyon üzerinden yapılabiliyor
-- (get_ride_counterparty_push_subscriptions ile aynı ilişki kontrolü).
create function public.create_notification_event(p_ride_id uuid, p_recipient_id uuid, p_nav_target text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_nav_target not in ('my_rides', 'my_bookings') then
    raise exception 'invalid nav_target: %', p_nav_target;
  end if;

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

  insert into public.notification_events (recipient_id, ride_id, nav_target)
  values (p_recipient_id, p_ride_id, p_nav_target);
end;
$$;
