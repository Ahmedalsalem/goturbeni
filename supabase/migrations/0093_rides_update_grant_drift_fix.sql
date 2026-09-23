-- 0092_ride_departure_time_range.sql added departure_time_range_end but
-- skipped the required re-grant (see 0074's note: every migration that adds
-- a rides column must redo this) — every ride update (not just ones with a
-- range) started failing with 42501 permission denied, since updateRide's
-- buildRideRow always includes this column in the SET clause.
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ') into v_columns
    from pg_attribute
    where attrelid = 'public.rides'::regclass
      and attnum > 0
      and not attisdropped
      and attname not in ('driver_id', 'posted_by_role');
  execute format('grant update (%s) on public.rides to authenticated', v_columns);
end $$;
