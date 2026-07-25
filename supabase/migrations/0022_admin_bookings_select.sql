-- /admin/payments (getPendingDepositReceipts/getPendingRefunds,
-- 0020_payment_receipts.sql, 0021_cancellation_refunds.sql) queries
-- `bookings` through the normal RLS-bound client, but the existing "select
-- own or driver bookings" policy (0003_bookings.sql) only lets a booking's
-- own passenger or the ride's driver see it — an admin who isn't personally
-- a party to the booking gets zero rows back, so the review screen always
-- looks empty. Same drop+recreate pattern as 0014_admin.sql's suspension
-- policies: add an is_admin() bypass alongside the existing conditions.

drop policy "select own or driver bookings" on public.bookings;

create policy "select own or driver bookings" on public.bookings
  for select using (
    auth.uid() = passenger_id
    or exists (select 1 from public.rides where rides.id = bookings.ride_id and rides.driver_id = auth.uid())
    or public.is_admin()
  );
