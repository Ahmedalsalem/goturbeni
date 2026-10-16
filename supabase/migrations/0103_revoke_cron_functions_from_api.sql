-- Bu fonksiyonlar yalnızca pg_cron'dan (postgres rolüyle) çağrılıyor, ama
-- Postgres'te fonksiyonlar varsayılan olarak PUBLIC'e EXECUTE ile açık
-- oluşturulduğu için PostgREST üzerinden anon/authenticated da
-- çağırabiliyordu (prod'da has_function_privilege ile doğrulandı,
-- 2026-10-16). Özellikle send_departure_reminders herkesin tetikleyebildiği
-- bir toplu e-posta gönderimiydi. 0102'deki send_new_ride_digest zaten aynı
-- şekilde kapatıldı.
revoke execute on function public.send_departure_reminders() from public, anon, authenticated;
revoke execute on function public.complete_past_rides() from public, anon, authenticated;
revoke execute on function public.generate_recurring_rides() from public, anon, authenticated;
