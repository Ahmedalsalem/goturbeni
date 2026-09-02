-- get_offer_driver_readiness (0063) checked iban_ok/plate_ok but missed the
-- car_color requirement added for driver-posted rides (0076_car_color.sql) —
-- a driver who only ever makes OFFERS on passenger listings (never posts
-- their own ride) could get approved without ever setting a car color,
-- defeating its whole point (yolcunun doğru aracı teşhis edebilmesi).
-- RETURNS TABLE'a yeni bir OUT parametresi (color_ok) eklemek dönüş tipini
-- değiştiriyor — create or replace bunu kabul etmez, önce eski imza
-- düşürülüyor (0050/0070/0075'teki gibi).
drop function public.get_offer_driver_readiness(uuid);

create function public.get_offer_driver_readiness(p_booking_id uuid)
returns table (iban_ok boolean, plate_ok boolean, color_ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found or v_booking.passenger_id <> auth.uid() or v_booking.booker_role <> 'driver' then
    raise exception 'not_authorized';
  end if;

  return query
    select
      (pp.iban is not null and pp.iban_holder_name is not null),
      (p.car_plate is not null),
      (p.car_color is not null)
    from public.profiles p
    left join public.profiles_private pp on pp.id = p.id
    where p.id = v_booking.driver_id;
end;
$$;
