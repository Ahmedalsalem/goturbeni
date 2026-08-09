-- Faz 2A — RLS politikalarını posted_by/booker_role'e göre genişlet.
--
-- rides: "insert own ride" — 0014_admin.sql'deki (suspension eklenmiş) son
-- hâlini rol-farkında yapıyoruz. Sürücü ilanında eski davranış birebir
-- korunuyor (auth.uid() = posted_by = driver_id). Yolcu ilanında driver_id
-- NULL olmalı, posted_by ilanı açan yolcu olmalı.
drop policy "insert own ride" on public.rides;
create policy "insert own ride" on public.rides
  for insert to authenticated
  with check (
    (
      (posted_by_role = 'driver' and auth.uid() = posted_by and auth.uid() = driver_id)
      or (posted_by_role = 'passenger' and auth.uid() = posted_by and driver_id is null)
    )
    and not public.is_suspended()
  );

-- rides: "update own ride" — 0002_rides.sql'den beri hiç değişmemişti,
-- driver_id yerine posted_by kullanacak şekilde değiştiriliyor.
--
-- DÜZELTME (ilk review turunda bulunan bir açığın düzeltmesi de kendi
-- içinde açık çıktı — bkz. ikinci review): with check içine
-- "posted_by_role <> 'driver' or auth.uid() = driver_id" gibi bir dal
-- eklemek yetersiz, çünkü posted_by_role'ün KENDİSİ de aynı UPDATE
-- ifadesinde değiştirilebilen sıradan bir kolon — bir saldırgan aynı
-- UPDATE'te hem driver_id'yi hem posted_by_role'ü değiştirip (örn.
-- posted_by_role = 'passenger' yaparak) with check'in her iki dalını da
-- NEW satır üzerinden geçersiz kılabilirdi. RLS'in with check'i sadece
-- NEW satırı görüyor, OLD ile karşılaştıramıyor — bu yüzden "bu kolon hiç
-- değişmesin" kuralı RLS boolean ifadesiyle güvenilir şekilde ifade
-- edilemiyor.
--
-- Çözüm: RLS yerine (ya da RLS'e ek olarak) kolon bazlı GRANT/REVOKE
-- kullanmak — bu, Postgres'in RLS'ten tamamen bağımsız, değerlere değil
-- sadece UPDATE ifadesinin SET listesindeki kolon adlarına bakan ayrı bir
-- yetki katmanı. driver_id ve posted_by_role'ün UPDATE yetkisi
-- authenticated'den tamamen kaldırılıyor (aşağıda) — bu iki kolon artık
-- hiçbir doğrudan client UPDATE'i ile değiştirilemez, değerleri ne
-- olursa olsun. Sadece security-definer fonksiyonlar (approve_booking ->
-- _apply_booking_approval), fonksiyon SAHİBİNİN yetkileriyle çalıştığı
-- için (authenticated'in GRANT/REVOKE'undan etkilenmez — RLS'i bugün
-- zaten bu şekilde bypass ediyorlar) driver_id'yi değiştirebilir.
-- with check'teki koşul artık sadece posted_by için (zaten kendinden
-- güvenli — auth.uid() = posted_by, çağıran kendinden başka birini
-- posted_by yapamaz), driver_id/posted_by_role koruması GRANT katmanına
-- taşındı.
drop policy "update own ride" on public.rides;
create policy "update own ride" on public.rides
  for update to authenticated
  using (auth.uid() = posted_by and status = 'active')
  with check (auth.uid() = posted_by);

revoke update (driver_id, posted_by_role) on public.rides from authenticated;

-- bookings: "insert own booking" — 0014_admin.sql'deki son hâlini
-- rol-farkında yapıyoruz. booker_role = 'passenger' (normal rezervasyon
-- talebi) davranışı birebir korunuyor. booker_role = 'driver' (bir yolcu
-- ilanına teklif) satırında auth.uid() teklif veren sürücü olmalı
-- (driver_id), passenger_id ilan sahibi yolcu olmalı — bu ikinci eşitlik
-- burada DENETLENMİYOR (RLS insert policy'si sadece auth.uid()'in
-- doğrulanabilir bir alanla eşleştiğini garanti eder; passenger_id'nin
-- gerçekten o ilanın sahibi olduğu app katmanında/approve_booking'de
-- doğrulanır — bookings tablosunun kendisi "hangi ride_id" ile "hangi
-- passenger_id" arasında bir kısıt taşımıyor, tıpkı bugünkü normal
-- rezervasyon taleplerinde de olduğu gibi).
drop policy "insert own booking" on public.bookings;
create policy "insert own booking" on public.bookings
  for insert to authenticated
  with check (
    (
      (booker_role = 'passenger' and auth.uid() = passenger_id)
      or (booker_role = 'driver' and auth.uid() = driver_id)
    )
    and not public.is_suspended()
  );

-- bookings: "select own or driver bookings" — 0022_admin_bookings_select.sql'deki
-- son hâlini genişletiyoruz. rides.driver_id yerine rides.posted_by
-- kullanmak sürücü ilanlarında davranışı değiştirmiyor (posted_by =
-- driver_id) ve yolcu ilanlarında "ilan sahibi kendi ilanına gelen
-- teklifleri görür" davranışını ekliyor. Ayrıca teklif veren sürücünün
-- KENDİ teklifini (booker_role='driver' satırında auth.uid() = driver_id)
-- görebilmesi ekleniyor.
drop policy "select own or driver bookings" on public.bookings;
create policy "select own or driver bookings" on public.bookings
  for select using (
    auth.uid() = passenger_id
    or auth.uid() = bookings.driver_id
    or exists (select 1 from public.rides where rides.id = bookings.ride_id and rides.posted_by = auth.uid())
    or public.is_admin()
  );

-- Üçüncü savunma katmanı — bookings_driver_id_matches_booker_role (0057) ile
-- aynı desen. driver_id/posted_by_role artık GRANT ile (yukarıda) client
-- UPDATE'inden tamamen korunuyor, ama bu kısıt yine de ekleniyor: hem
-- INSERT'te (RLS politikası bunu zaten sağlıyor ama iki bağımsız kanıt
-- bir tane olmasından iyidir) hem de GRANT/RLS'i bypass eden
-- security-definer fonksiyonlarda ileride çıkabilecek bir hatanın veri
-- bütünlüğünü bozmasını engeller. Var olan tüm satırlar posted_by_role
-- ='driver' (0057'nin varsayılanı) ve posted_by=driver_id (0057'nin
-- backfill'i) olduğundan bu kısıt hiçbir var olan satırı reddetmez.
alter table public.rides add constraint rides_posted_by_matches_driver_when_driver_posted
  check (posted_by_role <> 'driver' or posted_by = driver_id);
