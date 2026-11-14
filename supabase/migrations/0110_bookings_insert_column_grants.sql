-- GB-SEC-002: the "insert own booking" policy only checks who the row
-- belongs to, and authenticated still had Supabase's default table-wide
-- INSERT grant. A signed-in user could insert a booking that was already
-- status='approved', payment_status='settled', which unlocks the driver's
-- phone, live location, chat and reviews without the driver ever approving.
--
-- Clients may now only supply the columns a new offer needs (createOffer in
-- src/features/bookings/actions.ts); everything else, status and
-- payment_status included, takes its column default. create_booking and
-- _apply_booking_approval are SECURITY DEFINER and keep working unchanged.
revoke insert on public.bookings from anon, authenticated;
grant insert (ride_id, passenger_id, seat_count, booker_role, driver_id, offered_cost_share)
  on public.bookings to authenticated;
