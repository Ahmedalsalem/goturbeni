-- İlan formunda/aramada şehir seçimi artık aranabilir (autocomplete) bir
-- Combobox; bu migration isteğe bağlı bir ilçe düzeyi ekliyor. Nullable —
-- mevcut ilanlar (ilçesiz) ve ilçe belirtmek istemeyen kullanıcılar için
-- geriye dönük uyumlu. Şehir seçimi zaten `rides` RLS/uygulama katmanında
-- doğrulanıyor; ilçe de Zod şemasında seçili şehrin ilçe listesine karşı
-- doğrulanır (bkz. src/features/rides/schemas.ts), bu yüzden burada ayrı bir
-- check kısıtlaması gerekmiyor.
alter table public.rides
  add column departure_district text,
  add column arrival_district text;
