-- Formal anlaşmazlık (itiraz) çözüm süreci. Bugüne kadar "Parayı gönderdim
-- ama sürücü inkar ediyor" gibi durumlarda admin'in elinde yalnızca ad-hoc
-- admin_cancel_ride/admin_confirm_refund/admin_reject_refund_proof butonları
-- vardı — hiçbir taraf bir sorunu resmi olarak "bildiremiyor", admin de
-- bekleyen anlaşmazlıkların bir listesini göremiyordu. Bu migration, bookings
-- tablosundaki güvenlik-definer RPC deseninin (approve/reject/cancel_booking,
-- 0003_bookings.sql) aynısını kullanan ayrı bir disputes tablosu ekliyor.

create type public.dispute_reason as enum (
  'payment_not_received',
  'payment_amount_mismatch',
  'service_not_as_described',
  'safety_concern',
  'other'
);

create type public.dispute_status as enum ('open', 'in_review', 'resolved', 'dismissed');

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  opened_by uuid not null references public.profiles (id) on delete cascade,
  against_user_id uuid not null references public.profiles (id) on delete cascade,
  reason public.dispute_reason not null,
  description text not null check (char_length(description) between 10 and 2000),
  status public.dispute_status not null default 'open',
  resolution_note text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index disputes_booking_id_idx on public.disputes (booking_id);
create index disputes_opened_by_idx on public.disputes (opened_by);
create index disputes_against_user_id_idx on public.disputes (against_user_id);
create index disputes_status_idx on public.disputes (status);

-- Bir kullanıcı aynı rezervasyon için aynı anda birden fazla açık anlaşmazlık
-- açamaz (spam koruması); reddedilmiş/çözülmüş bir anlaşmazlıktan sonra
-- gerekirse yeniden açabilir — bookings_one_active_per_passenger_ride ile
-- aynı partial-unique-index deseni.
create unique index disputes_one_active_per_booking_opener on public.disputes (booking_id, opened_by)
  where status in ('open', 'in_review');

alter table public.disputes enable row level security;

create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute procedure public.set_updated_at();

-- Taraflardan biri (açan veya karşı taraf) ya da admin görebilir — bookings'in
-- "select own or driver bookings" politikasıyla aynı ilke.
create policy "select own or against or admin" on public.disputes
  for select using (
    auth.uid() = opened_by or auth.uid() = against_user_id or public.is_admin()
  );

-- Kasıtlı olarak insert/update politikası YOK: yazma yalnızca aşağıdaki
-- security-definer RPC'ler üzerinden yapılır (bookings'teki desenin aynısı).

-- Rezervasyonun yolcusu ya da ilanın sürücüsü, karşı taraf hakkında bir
-- anlaşmazlık açar. against_user_id, çağıranın rolüne göre otomatik belirlenir.
create function public.open_dispute(p_booking_id uuid, p_reason public.dispute_reason, p_description text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_ride public.rides;
  v_against uuid;
  v_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found';
  end if;

  select * into v_ride from public.rides where id = v_booking.ride_id;

  if auth.uid() = v_booking.passenger_id then
    v_against := v_ride.driver_id;
  elsif auth.uid() = v_ride.driver_id then
    v_against := v_booking.passenger_id;
  else
    raise exception 'not_authorized';
  end if;

  insert into public.disputes (booking_id, opened_by, against_user_id, reason, description)
  values (p_booking_id, auth.uid(), v_against, p_reason, p_description)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'dispute_already_open';
end;
$$;

-- Admin, bir anlaşmazlığı inceleme sürecinde ilerletir/kapatır — admin_cancel_ride
-- ile aynı yetkilendirme deseni (0014_admin.sql). resolved_by/resolved_at
-- yalnızca sonuç durumlarına (resolved/dismissed) geçişte set edilir; 'open'
-- → 'in_review' gibi ara geçişlerde dokunulmaz.
create function public.admin_set_dispute_status(p_dispute_id uuid, p_status public.dispute_status, p_resolution_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.disputes
    set status = p_status,
        resolution_note = coalesce(p_resolution_note, resolution_note),
        resolved_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else resolved_by end,
        resolved_at = case when p_status in ('resolved', 'dismissed') then now() else resolved_at end
    where id = p_dispute_id;

  if not found then
    raise exception 'dispute_not_found';
  end if;
end;
$$;
