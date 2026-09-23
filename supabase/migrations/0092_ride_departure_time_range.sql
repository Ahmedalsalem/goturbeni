-- Yolcu ilanında tek bir kesin saat yerine bir saat aralığı ("14:00-16:00
-- arası uygunum") verilebilsin (kullanıcı isteği, 2026-09-22). Sürücü
-- ilanında değişiklik yok — sürücü hâlâ tek bir kesin kalkış saatini
-- taahhüt ediyor. Var olan "Gün boyu uygun" (time_flexible) seçeneğiyle
-- çakışmıyor, ayrı bir alternatif: time_flexible=true iken bu kolon
-- kullanılmaz (form gizler, uygulama katmanında NULL'a zorlanır).
--
-- Nullable + rides.departure_time (aralığın BAŞLANGICI) zaten var olan tek
-- kaynak olarak kalıyor — sıralama/filtreleme/geçmiş-kontrolü gibi mevcut
-- her yer değişmeden çalışmaya devam ediyor, sadece departure_time_range_end
-- doluysa UI bunu bir aralık olarak gösteriyor.
alter table public.rides
  add column departure_time_range_end timestamptz;

alter table public.rides
  add constraint rides_departure_time_range_end_after_start
  check (departure_time_range_end is null or departure_time_range_end > departure_time);
