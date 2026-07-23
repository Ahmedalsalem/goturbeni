-- Faz 8: ilan durumu artık kalkış saati geçtiğinde otomatik olarak
-- 'completed'e geçiyor. Önceden bu geçiş hiç tetiklenmiyordu — "tamamlandı"
-- mantığı yalnızca `departure_time < now()` karşılaştırmasına dayanıyordu
-- (bkz. README → "Tamamlandı nasıl hesaplanıyor?"). O karşılaştırma hâlâ
-- reviews/bookings tarafında kullanılıyor (bu migration onu değiştirmiyor);
-- bu migration yalnızca `rides.status` sütununu gerçeğe yaklaştırıyor
-- (ör. ilan listesinde rozetin de "Tamamlandı" göstermesi için).
--
-- pg_cron her dakika çalışır. Uygulama service_role kullanmadığından (bkz.
-- README → Environment Variables) geçiş veritabanı içinde, `security
-- definer` bir fonksiyonla (postgres sahipliğinde, RLS'e tabi değil) yapılır
-- — pg_cron job'unun kendisi hangi rolle planlandıysa o rolle çalışır, ama
-- fonksiyonun RLS'i bypass etmesi için ayrıca definer olması gerekir.
create extension if not exists pg_cron with schema extensions;

create function public.complete_past_rides()
returns void
language sql
security definer
set search_path = public
as $$
  update public.rides
  set status = 'completed'
  where status in ('active', 'full')
    and departure_time < now();
$$;

select cron.schedule('complete-past-rides', '* * * * *', $$select public.complete_past_rides()$$);
