-- Canlı doğrulama sırasında bulunan gerçek hata: get_search_alert_recipients
-- (0043_ride_search_alerts.sql) `email` sütununu `text` olarak beyan ediyor,
-- ama `auth.users.email` aslında `character varying(255)` — bu ikisi bir
-- PL/pgSQL fonksiyonunun `return query`'sinde örtük olarak eşleşmiyor,
-- fonksiyon her çağrıda "structure of query does not match function result
-- type" (42804) ile başarısız oluyordu. Sonuç: her ilan oluşturmada arama
-- uyarısı push/e-posta bildirimleri sessizce hiç gönderilmiyordu (hata
-- yutulup loglanıyor, ilan oluşturmayı engellemiyor — bkz.
-- src/lib/search-alert-notifications.ts). Açık `::text` cast'i ekler.

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
    select a.user_id, u.email::text, ps.endpoint, ps.p256dh, ps.auth
    from public.ride_search_alerts a
    join auth.users u on u.id = a.user_id
    left join public.push_subscriptions ps on ps.user_id = a.user_id
    where a.departure_city = v_ride.departure_city
      and a.arrival_city = v_ride.arrival_city
      and a.user_id <> v_ride.driver_id;
end;
$$;
