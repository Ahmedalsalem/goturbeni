-- E-posta bildirimi için: gönderen taraf, ilan üzerinden karşı tarafın
-- e-posta adresini okuyabilmeli. get_ride_counterparty_push_subscriptions
-- ile birebir aynı ilişki kontrolü (0012_push_subscriptions.sql) —
-- yalnızca hedef, public.push_subscriptions yerine auth.users.email.
-- security definer olduğu için auth şemasına erişebilir (0010'daki
-- phone_confirmed_at trigger'ı da aynı şemaya dokunuyor).
create function public.get_ride_counterparty_email(p_ride_id uuid, p_recipient_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not exists (
    select 1 from public.rides r
    where r.id = p_ride_id
      and (
        (r.driver_id = auth.uid() and exists (
          select 1 from public.bookings b where b.ride_id = p_ride_id and b.passenger_id = p_recipient_id
        ))
        or (r.driver_id = p_recipient_id and exists (
          select 1 from public.bookings b where b.ride_id = p_ride_id and b.passenger_id = auth.uid()
        ))
      )
  ) then
    return null;
  end if;

  select email into v_email from auth.users where id = p_recipient_id;
  return v_email;
end;
$$;
