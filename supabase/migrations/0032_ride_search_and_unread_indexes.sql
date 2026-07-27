-- Performance: /rides (highest-traffic public page) filters on status +
-- departure_city + arrival_city + departure_district/arrival_district on
-- every search, then sorts by departure_time — only status and
-- departure_time individually had an index (0002_rides.sql), so a filtered
-- search was a sequential scan over every active ride. A composite index
-- covering the common "active rides between two cities, soonest first"
-- shape lets Postgres satisfy the filter and the ORDER BY from the index
-- directly. Separate partial indexes cover the district-level fallback
-- (buildRidesQuery(..., district: true) in features/rides/queries.ts) since
-- most rides don't set a district.
create index rides_active_search_idx
  on public.rides (status, departure_city, arrival_city, departure_time);

create index rides_departure_district_idx
  on public.rides (departure_district)
  where departure_district is not null;

create index rides_arrival_district_idx
  on public.rides (arrival_district)
  where arrival_district is not null;

-- Header (rendered on every authenticated page load, see
-- src/components/layout/Header.tsx) calls getUnreadMessages(userId), which
-- filters messages on receiver_id + read_at is null with no supporting
-- index (0004_messages.sql only indexes ride_id) — a per-request sequential
-- scan over the whole messages table. Partial index since only unread rows
-- (read_at is null) are ever queried this way.
create index messages_receiver_unread_idx
  on public.messages (receiver_id)
  where read_at is null;
