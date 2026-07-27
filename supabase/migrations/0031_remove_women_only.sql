-- "Yalnızca kadın yolcu" (women_only) ilan filtresi kaldırılıyor — platformda
-- artık sadece ters yönü var: yolcu, sürücünün kadın olduğu ilanları arayabiliyor
-- (bkz. 0030_female_driver_filter.sql, get_female_driver_ride_ids). Üretimde bu
-- sütunu true olan hiçbir ilan yoktu (doğrulandı), veri kaybı riski yok.

drop policy "select all rides" on public.rides;

create policy "select all rides" on public.rides
  for select using (true);

alter table public.rides drop column women_only;
