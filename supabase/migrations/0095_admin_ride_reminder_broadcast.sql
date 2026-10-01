-- Kullanıcı isteği: admin panelindeki ilanlar listesinden bir ilanı tüm
-- üyelere tekrar hatırlatabilmek. get_all_member_emails_for_broadcast
-- (0067/0075) bunun için kullanılamıyor — yalnızca ilanın sahibi
-- çağırabiliyor ve ride_broadcast_dispatches ile her ilan için tek seferlik.
-- Bu RPC aynı alıcı kümesini (ilanı veren hariç, silinmiş hesaplar ve
-- e-posta bildirimini kapatanlar hariç) admin-gated olarak ve dispatch
-- kaydı tutmadan döndürüyor, böylece istenildiği kadar tekrarlanabiliyor.
create function public.admin_get_ride_reminder_recipients(p_ride_id uuid)
returns table (user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.rides;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select * into v_ride from public.rides where id = p_ride_id;
  if not found then
    raise exception 'ride_not_found';
  end if;

  return query
    select p.id, u.email::text
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.profiles_private pp on pp.id = p.id
    where p.id <> v_ride.posted_by
      and p.deleted_at is null
      and coalesce(pp.email_notifications_enabled, true);
end;
$$;
