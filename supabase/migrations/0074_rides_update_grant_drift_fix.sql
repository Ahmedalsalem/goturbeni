-- 0058_passenger_listings_rls.sql, tabloda o an var olan kolonlar üzerinden
-- BİR KEZ dinamik olarak "grant update (...)" çalıştırmıştı ve bakım
-- notunda her yeni kolonun açıkça grant edilmesi gerektiğini yazmıştı.
-- 0065 (instant_booking), 0070/0071 (car_features, custom_car_features),
-- 0072 (quiet_ride, no_large_luggage, no_stops) ve 0073 (payment_methods)
-- bu notu atladı — sonuç: updateRide (rides/actions.ts), buildRideRow'da bu
-- kolonları her zaman SET listesine dahil ettiğinden, authenticated rolüyle
-- yapılan HER ride güncellemesi "permission denied for table rides"
-- (42501) ile başarısız oluyordu (canlıda doğrulandı — bugfix #2'nin e2e
-- doğrulaması sırasında ortaya çıktı).
--
-- 0058'deki dinamik deseni aynen tekrarlıyoruz: sadece eksik kolonlara değil
-- (idempotent olsun ve gelecekte fark edilmeyen bir sürüklenme kalmasın
-- diye) TÜM uygun kolonlara yeniden grant veriyoruz — zaten izinli olanlar
-- için bu no-op.
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ') into v_columns
    from pg_attribute
    where attrelid = 'public.rides'::regclass
      and attnum > 0
      and not attisdropped
      and attname not in ('driver_id', 'posted_by_role');
  execute format('grant update (%s) on public.rides to authenticated', v_columns);
end $$;
