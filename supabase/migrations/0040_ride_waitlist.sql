-- Kullanıcı talebi: "koltuk açılınca sıraya alma" — dolu bir ilana talep
-- oluşturamayan yolcu bir bekleme listesine katılabilsin. Tasarım (kullanıcı
-- onayıyla): yalnızca bildirim gönderilir, otomatik rezervasyon oluşturulmaz
-- — koltuk açıldığında (bkz. cancelBooking, src/features/bookings/actions.ts)
-- listedeki herkese "koltuk açıldı" bildirimi gider, normal talep/onay akışı
-- (createBooking/approve_booking) işler; ilk rezervasyon talep eden kazanır.
create table public.ride_waitlist (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  seat_count integer not null check (seat_count > 0),
  created_at timestamptz not null default now(),
  unique (ride_id, passenger_id)
);

create index ride_waitlist_ride_id_idx on public.ride_waitlist (ride_id);

alter table public.ride_waitlist enable row level security;

create policy "select own waitlist entry" on public.ride_waitlist
  for select to authenticated
  using (auth.uid() = passenger_id);

-- Sürücü, kendi ilanının bekleme listesini görebilir (bkz. /rides/[id]/bookings
-- — "N kişi bekliyor" sayısı) ama yolcunun kimliğini/detayını göstermiyoruz,
-- yalnızca sayıyı — bu politika yine de tam satır erişimi verir çünkü count
-- sorgusu da RLS'e tabi; UI tarafı bilinçli olarak sadece sayıyı render ediyor.
create policy "driver selects own ride waitlist" on public.ride_waitlist
  for select to authenticated
  using (exists (select 1 from public.rides r where r.id = ride_id and r.driver_id = auth.uid()));

create policy "insert own waitlist entry" on public.ride_waitlist
  for insert to authenticated
  with check (
    auth.uid() = passenger_id
    and exists (select 1 from public.rides r where r.id = ride_id and r.status in ('active', 'full') and r.departure_time > now())
  );

-- .upsert(..., { onConflict: "ride_id,passenger_id" }) (joinRideWaitlist,
-- src/features/waitlist/actions.ts) compiles to INSERT ... ON CONFLICT DO
-- UPDATE when the row already exists (rejoin after a network retry, a
-- second tab, etc.) — without this policy that UPDATE arm is silently
-- denied by RLS, same pitfall push_subscriptions (0012) and
-- ride_live_locations (0038) already had to account for.
create policy "update own waitlist entry" on public.ride_waitlist
  for update to authenticated
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

create policy "delete own waitlist entry" on public.ride_waitlist
  for delete to authenticated
  using (auth.uid() = passenger_id);

-- Koltuğun GERÇEKTEN boşaldığını (bir onaylı rezervasyonun iptal edilmesiyle)
-- kanıtlanabilir şekilde işaretlemek için — cancel_booking dışında hiçbir
-- yerden yazılamıyor (bookings tablosunda hiç UPDATE RLS politikası yok,
-- bkz. 0003_bookings.sql), bu yüzden bekleme listesi RPC'lerinin
-- yetkilendirmesi için güvenle kullanılabilir bir "gerçekten oldu" sinyali.
alter table public.bookings add column seat_freed_at timestamptz;

-- İmza değişiyor (void -> boolean, "koltuk gerçekten boşaldı mı" caller'a
-- doğrudan dönüyor) — create or replace dönüş tipini değiştiremediği için
-- önce drop ediliyor. Bu, cancelBooking'in (src/features/bookings/actions.ts)
-- RPC'den ÖNCE ayrı bir select ile durumu tahmin etmesi gerekmemesi için:
-- önceki tasarımda booking durumu RPC çağrısından önce okunuyordu, bu da
-- eşzamanlı bir approve_booking ile yarışabilirdi (TOCTOU) — artık tek,
-- zaten satırı kilitleyen RPC'nin kendisi kesin cevabı veriyor.
drop function public.cancel_booking(uuid);

create function public.cancel_booking(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'booking_not_found';
  end if;
  if v_booking.passenger_id <> auth.uid() then
    raise exception 'not_booking_owner';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'booking_not_cancellable';
  end if;

  if v_booking.status = 'approved' then
    update public.rides
      set available_seats = available_seats + v_booking.seat_count,
          status = case when status = 'full' then 'active' else status end
      where id = v_booking.ride_id;
  end if;

  update public.bookings
    set status = 'cancelled', seat_freed_at = case when v_booking.status = 'approved' then now() else null end
    where id = p_booking_id;

  return v_booking.status = 'approved';
end;
$$;

-- Bir koltuk açıldığında (bkz. cancelBooking, src/features/bookings/actions.ts)
-- tetikleyen taraf (iptal eden yolcu) bekleme listesindeki HERKESİN push
-- aboneliğini okuyabilmeli. Yetkilendirme kasıtlı olarak dar: çağıranın
-- BU ilanda, son birkaç dakika içinde gerçekten onaylıyken iptal edilmiş
-- (seat_freed_at) bir rezervasyonu olması gerekiyor — "bu ilanda herhangi
-- bir rezervasyonu olmuş biri" değil. seat_freed_at yalnızca cancel_booking
-- tarafından (ve yalnızca gerçekten onaylı bir rezervasyon iptal edildiğinde)
-- yazılabildiğinden, bu kontrol sahte bir rezervasyon oluşturup hemen iptal
-- ederek (hiç onaylanmadan) veya sadece "bu ilana bir zamanlar talepte
-- bulunmuş olmak"la atlatılamaz — gerçekten sürücünün onayladığı bir
-- rezervasyonun az önce iptal edilmiş olmasını gerektirir.
create function public.get_ride_waitlist_push_subscriptions(p_ride_id uuid)
returns setof public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sadece bu koşulu sağlayan, iptal etmiş yolcuyu yetkilendiriyor — sürücü
  -- dalı yok: hiçbir çağıran kod yolu sürücüden tetiklenmiyor, ve sürücünün
  -- kendi ilanını "full" duruma getirip bu RPC'yi istediği an çağırabilmesi
  -- (ikinci bir hesapla rezervasyon onaylatarak) gereksiz bir saldırı yüzeyi
  -- olurdu — en az yetki ilkesi.
  if not exists (
    select 1 from public.bookings b
    where b.ride_id = p_ride_id and b.passenger_id = auth.uid()
      and b.seat_freed_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  return query
    select ps.* from public.push_subscriptions ps
    join public.ride_waitlist w on w.passenger_id = ps.user_id
    where w.ride_id = p_ride_id;
end;
$$;

-- Aynı dar yetkilendirme, e-posta kanalı için (get_ride_counterparty_email ile
-- aynı desen — security definer olduğu için auth şemasına erişebiliyor).
create function public.get_ride_waitlist_emails(p_ride_id uuid)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sadece bu koşulu sağlayan, iptal etmiş yolcuyu yetkilendiriyor — sürücü
  -- dalı yok: hiçbir çağıran kod yolu sürücüden tetiklenmiyor, ve sürücünün
  -- kendi ilanını "full" duruma getirip bu RPC'yi istediği an çağırabilmesi
  -- (ikinci bir hesapla rezervasyon onaylatarak) gereksiz bir saldırı yüzeyi
  -- olurdu — en az yetki ilkesi.
  if not exists (
    select 1 from public.bookings b
    where b.ride_id = p_ride_id and b.passenger_id = auth.uid()
      and b.seat_freed_at > now() - interval '10 minutes'
  ) then
    return;
  end if;

  return query
    select w.passenger_id, u.email from public.ride_waitlist w
    join auth.users u on u.id = w.passenger_id
    where w.ride_id = p_ride_id;
end;
$$;
