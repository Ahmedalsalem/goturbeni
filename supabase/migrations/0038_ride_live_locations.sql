-- Kullanıcı talebi: onaylanmış bir rezervasyonu olan yolcu, sürücünün canlı
-- konumunu (yaklaşıyor mu değil mi) görebilsin. Tek satır/ilan (upsert),
-- geçmiş konum kaydı tutulmuyor — yalnızca "şu an nerede". Realtime üzerinden
-- yayınlanıyor, messages tablosuyla aynı desen (select RLS policy'si
-- abonelikler için de geçerli).
--
-- Paylaşımı durdurmak DELETE değil, is_active=false UPDATE'i ile yapılıyor —
-- DELETE event'lerinin Realtime+RLS ile birlikte REPLICA IDENTITY FULL
-- gerektirmesi ve satırın kimin olduğunu RLS dışına sızdırabilmesi gibi ek
-- karmaşıklıklardan kaçınıyor, ayrıca "son görülme" konumunu/zamanını
-- yolcu tarafında göstermeye de izin veriyor.
create table public.ride_live_locations (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.ride_live_locations enable row level security;

-- Sürücünün kendisi, ya da bu ilanda ONAYLANMIŞ (approved) rezervasyonu olan
-- yolcu(lar) konumu görebilir — bekleyen bir talepte konum paylaşılmaz.
create policy "select ride live location as driver or approved passenger" on public.ride_live_locations
  for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.bookings b
      where b.ride_id = ride_live_locations.ride_id
        and b.passenger_id = auth.uid()
        and b.status = 'approved'
    )
  );

create policy "driver inserts own ride live location" on public.ride_live_locations
  for insert to authenticated
  with check (
    driver_id = auth.uid()
    and exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid())
  );

create policy "driver updates own ride live location" on public.ride_live_locations
  for update to authenticated
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

-- Supabase'in varsayılan realtime publication'ına ekle — messages (0004) ile
-- aynı desen: select RLS policy'si abonelikler için de geçerli, yani bir
-- yolcu yalnızca gerçekten onaylı olduğu ilanların konumuna abone olabilir.
alter publication supabase_realtime add table public.ride_live_locations;
