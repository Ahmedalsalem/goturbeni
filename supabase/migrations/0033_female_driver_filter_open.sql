-- "Kadın Şoför" filtresi artık herkese açık (kullanıcının güncellenmiş kararı
-- — 0030'daki "yalnızca kadın kullanıcılar" kısıtı kaldırılıyor). Sürücünün
-- kendi gender satırı hâlâ herkese açık değil (profiles_private RLS aynen
-- duruyor); bu fonksiyon hâlâ yalnızca "hangi ilan id'lerinin sürücüsü kadın"
-- bilgisini açığa çıkarıyor, artık sadece çağıranın kendisi de kadın olması
-- şartı olmadan.
create or replace function public.get_female_driver_ride_ids()
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select r.id
    from public.rides r
    join public.profiles_private pp on pp.id = r.driver_id
    where pp.gender = 'female';
end;
$$;
