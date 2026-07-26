-- "Kadın Şoför" arama filtresi — 0016'daki "yalnızca kadın yolcu"nun ters
-- yönü: bu sefer yolcu, sürücünün kadın olduğu ilanları arıyor. Sürücünün
-- cinsiyeti (profiles_private.gender) 0016'daki karar gereği hâlâ herkese
-- açık değil ("cinsiyetin herkese açık olması gerekmez") — bu fonksiyon
-- yalnızca "hangi ilan id'lerinin sürücüsü kadın" bilgisini açığa çıkarır,
-- ve yalnızca kendisi kadın olduğunu beyan etmiş bir arayan için (kullanıcının
-- talebi: "kadın şoför seçeneğini sadece kadınlar yapsın").
create function public.get_female_driver_ride_ids()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles_private
    where id = auth.uid() and gender = 'female'
  ) then
    raise exception 'not_authorized';
  end if;

  return query
    select r.id
    from public.rides r
    join public.profiles_private pp on pp.id = r.driver_id
    where pp.gender = 'female';
end;
$$;
