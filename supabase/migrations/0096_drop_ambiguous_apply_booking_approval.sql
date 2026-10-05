-- 0090 redefined _apply_booking_approval with a 5th p_cost_share parameter
-- via `create or replace`, but a different argument list creates a new
-- overload instead of replacing the 4-argument one. create_booking's
-- instant-booking branch (0065) calls it with 4 arguments, which now matches
-- both overloads and fails with "function ... is not unique" (42725) — every
-- instant booking has been rejected since 0090. Dropping the old overload
-- leaves the 5-argument version (p_cost_share defaults to null), which every
-- existing 4- and 5-argument caller resolves to unambiguously.
drop function public._apply_booking_approval(uuid, uuid, integer, uuid);
