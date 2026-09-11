-- Admin panelde hesap doğrulama durumu + kayıt/son giriş bilgisi gösterilebilsin
-- diye. email_verified profiles_private'ta (PostgREST'e admin bypass'i yok,
-- bkz. features/admin/queries.ts'teki AdminUserRow yorumu), last_sign_in_at
-- ise auth.users'ta (PostgREST üzerinden hiç erişilemiyor) — admin_get_user_emails
-- (0068) ile aynı desen: admin-gated, p_user_ids ile scoped security-definer RPC.
-- 0068'i drop edip yerine bunu koyuyoruz; tek çağıran yer (getAdminUsers) zaten
-- güncelleniyor.
drop function public.admin_get_user_emails(uuid[]);

create function public.admin_get_user_verification_details(p_user_ids uuid[])
returns table (id uuid, email text, email_verified boolean, last_sign_in_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select u.id, u.email::text, coalesce(pp.email_verified, false), u.last_sign_in_at
    from auth.users u
    left join public.profiles_private pp on pp.id = u.id
    where u.id = any(p_user_ids);
end;
$$;
