-- Kullanıcı talebi: bir rezervasyon onaylandıktan sonra sürücü ve yolcu
-- birbirinin telefon numarasını görebilsin. profiles_private (0006) telefonu
-- sahibi dışında kimseye açmıyor, bu yüzden get_ride_driver_payment_info
-- (0017) ile aynı desende dar kapsamlı bir security definer RPC — ilişkiyi
-- burada tekrar doğruluyor, ama get_ride_counterparty_push_subscriptions'ın
-- aksine yalnızca ONAYLANMIŞ (approved) rezervasyonlarda çalışıyor (bekleyen
-- bir talepte telefon numarası paylaşılmaz).
create function public.get_ride_counterparty_phone(p_ride_id uuid, p_recipient_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and (
        (r.driver_id = auth.uid() and exists (
          select 1 from public.bookings b
          where b.ride_id = p_ride_id and b.passenger_id = p_recipient_id and b.status = 'approved'
        ))
        or (r.driver_id = p_recipient_id and exists (
          select 1 from public.bookings b
          where b.ride_id = p_ride_id and b.passenger_id = auth.uid() and b.status = 'approved'
        ))
      )
  ) then
    return null;
  end if;

  select phone into v_phone from public.profiles_private where id = p_recipient_id;
  return v_phone;
end;
$$;
