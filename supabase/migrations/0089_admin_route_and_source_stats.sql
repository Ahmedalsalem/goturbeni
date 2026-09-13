-- Kullanıcı talebi: admin panelde "hangi rota çalışıyor" (en çok ilan verilen
-- güzergahlar) ve "kullanıcı nereden geldi" (signup_source dağılımı,
-- 0088_signup_source.sql) metrikleri. PostgREST group-by desteklemediği için
-- diğer admin aggregate'leri gibi (bkz. admin_get_suspicious_accounts,
-- 0084_admin_user_verification_details.sql) security-definer RPC olarak.

create function public.admin_get_popular_routes(p_limit int default 10)
returns table (departure_city text, arrival_city text, ride_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select r.departure_city, r.arrival_city, count(*) as ride_count
    from public.rides r
    group by r.departure_city, r.arrival_city
    order by ride_count desc, r.departure_city, r.arrival_city
    limit p_limit;
end;
$$;

create function public.admin_get_signup_sources()
returns table (signup_source text, user_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
    select coalesce(p.signup_source, 'direct'), count(*) as user_count
    from public.profiles p
    group by coalesce(p.signup_source, 'direct')
    order by user_count desc;
end;
$$;
