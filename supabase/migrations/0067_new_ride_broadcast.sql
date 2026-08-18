-- Kullanıcı talebi: her yeni ilan yayınlandığında TÜM üyelere (yalnızca o
-- güzergaha arama uyarısı kuranlara değil — bu zaten get_search_alert_recipients
-- ile var, 0043) bir e-posta gitsin. get_search_alert_recipients'in aynı
-- desenini izliyor: ilanı yayınlayan sürücü/ilan sahibinin kendisi hariç
-- tutuluyor, ve bir "dispatch" tablosuyla aynı ilan için birden fazla
-- çağrıda (ör. bir retry) tekrar e-posta gitmesi engelleniyor.
--
-- Bilinçli bir kapsam dışı bırakma: alıcı filtresi yok — askıya alınmış,
-- doğrulanmamış veya hiç aktif olmayan hesaplar dahil profiles tablosundaki
-- HERKESE gidiyor, kullanıcının kendi isteği bu yöndeydi. Kullanıcı sayısı
-- büyüdükçe bunun gerçek bir teslim edilebilirlik/spam-şikayeti riski
-- taşıdığı uygulama tarafında (src/lib/new-ride-broadcast-email.ts) ayrıca not
-- edildi.
create table public.ride_broadcast_dispatches (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ride_broadcast_dispatches enable row level security;
-- Kasıtlı olarak hiçbir RLS politikası yok — tüm erişim aşağıdaki
-- security-definer RPC üzerinden.

create function public.get_all_member_emails_for_broadcast(p_ride_id uuid)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  -- Yalnızca ilanı yayınlayan (sürücü ilanında driver_id, yolcu ilanında
  -- posted_by) kendi ilanı için bu RPC'yi tetikleyebilir — get_search_alert_
  -- recipients'teki auth.uid() = driver_id kontrolünün posted_by-farkında hâli
  -- (0057_passenger_listings_schema.sql'den beri driver_id yolcu ilanlarında
  -- onay anına kadar NULL olabiliyor, posted_by her zaman doludur).
  select * into v_ride from public.rides where id = p_ride_id and posted_by = auth.uid();
  if not found then
    return;
  end if;

  insert into public.ride_broadcast_dispatches (ride_id) values (p_ride_id)
  on conflict (ride_id) do nothing;
  if not found then
    return;
  end if;

  return query
    select p.id, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id <> v_ride.posted_by;
end;
$$;
