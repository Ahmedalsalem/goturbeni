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
-- driver_id yerine posted_by kullanacak şekilde değiştiriliyor. Sürücü
-- ilanında posted_by = driver_id olduğundan davranış aynı.
drop policy "update own ride" on public.rides;
create policy "update own ride" on public.rides
  for update to authenticated
  using (auth.uid() = posted_by and status = 'active')
  with check (auth.uid() = posted_by);

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
