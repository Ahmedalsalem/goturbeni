-- Admin kullanıcı listesinde e-posta gösterilebilsin diye. auth.users
-- PostgREST üzerinden erişilebilir değil, bu yüzden admin_get_driver_payment_info
-- (0025) ile aynı desen: admin-gated bir security-definer RPC doğrudan
-- auth.users'ı okuyor. p_user_ids ile scoped tutuluyor — admin panelin o an
-- gösterdiği sayfadaki kullanıcılar dışında hiçbir e-posta çekilmiyor.
create function public.admin_get_user_emails(p_user_ids uuid[])
returns table (id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select u.id, u.email::text
    from auth.users u
    where u.id = any(p_user_ids);
end;
$$;
