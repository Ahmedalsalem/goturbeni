-- Faz 2: rides table — driver-created carpool listings. See
-- supabase/migrations/0001_profiles.sql for the migration workflow notes.

create type ride_status as enum ('active', 'full', 'completed', 'cancelled');

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  -- References profiles (not auth.users directly) so PostgREST can embed the
  -- driver's display name/avatar in a single `rides.select('*, driver:profiles(...)')`
  -- query. profiles.id is itself a 1:1 FK to auth.users, so this preserves the
  -- same referential guarantee.
  driver_id uuid not null references public.profiles (id) on delete cascade,
  -- No check constraint against the 81-province list on purpose: it would
  -- duplicate src/utils/turkish-provinces.ts as a second source of truth.
  -- The dropdown (no free text) plus Zod (features/rides/schemas.ts) are the
  -- enforcement layer, matching the "dropdown, no autocomplete" spec. The
  -- length check below is just a sanity backstop (longest province name is
  -- well under 50 chars), not a content validation.
  departure_city text not null check (char_length(departure_city) <= 50),
  arrival_city text not null check (char_length(arrival_city) <= 50),
  departure_time timestamptz not null,
  seat_count integer not null check (seat_count > 0),
  available_seats integer not null check (available_seats >= 0 and available_seats <= seat_count),
  cost_share numeric(10, 2) not null check (cost_share >= 0),
  -- Mirrors MAX_DESCRIPTION_LENGTH in features/rides/schemas.ts.
  description text check (char_length(description) <= 500),
  status ride_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rides_driver_id_idx on public.rides (driver_id);
create index rides_departure_time_idx on public.rides (departure_time);
create index rides_status_idx on public.rides (status);

alter table public.rides enable row level security;

-- "Herkes okuyabilir" — public read, no `to` clause so it applies to anon and
-- authenticated alike.
create policy "select all rides" on public.rides
  for select using (true);

-- Only a signed-in user can create a ride, and only as themselves.
create policy "insert own ride" on public.rides
  for insert to authenticated
  with check (auth.uid() = driver_id);

-- "Sadece sahibi düzenleyebilir" — only the driver can edit or cancel
-- (cancel is a status update, not a delete; no delete policy is defined).
-- `using` additionally requires the *current* row to be 'active': this is a
-- defense-in-depth backstop for the app-level `.eq("status", "active")`
-- guard in features/rides/actions.ts, so a cancelled/completed/full ride
-- can't be edited even via a direct API call. `with check` intentionally
-- omits the status condition so the active -> cancelled transition itself
-- (cancelRide) is still permitted.
create policy "update own ride" on public.rides
  for update to authenticated
  using (auth.uid() = driver_id and status = 'active')
  with check (auth.uid() = driver_id);

create trigger rides_set_updated_at
  before update on public.rides
  for each row execute procedure public.set_updated_at();
