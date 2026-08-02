-- Uygulama katmanındaki format doğrulamasının (features/profile/schemas.ts
-- TR_PLATE_PATTERN) DB seviyesinde bir karşılığı yoktu — 0050'deki
-- car_plate sütunu yalnızca uzunluk kontrolü yapıyordu. Bu kural artık DB'de
-- de zorlanıyor: standart Türk plaka formatları (il kodu + 1-3 harf + rakam),
-- app'in ürettiği gibi büyük harf ve tek boşluklu ya da boşluksuz.
--
-- NOT VALID: var olan satırları geriye dönük ihlal etmez — 0050'den bu yana
-- serbest metin olarak girilmiş plakalar (varsa) bozulmadan kalır, kural
-- yalnızca bundan sonraki INSERT/UPDATE'lere uygulanır. Mevcut verinin de
-- uyumlu hale getirilip getirilmeyeceği ayrı bir karar — istenirse sonradan
-- `alter table public.profiles validate constraint car_plate_format_check;`
-- ile (ihlal eden satırlar önce temizlendikten sonra) doğrulanabilir.
alter table public.profiles
  add constraint car_plate_format_check
  check (
    car_plate is null
    or car_plate ~ '^(0[1-9]|[1-7][0-9]|8[01]) ?[A-PR-VYZ] ?[0-9]{4,5}$'
    or car_plate ~ '^(0[1-9]|[1-7][0-9]|8[01]) ?[A-PR-VYZ]{2} ?[0-9]{3,4}$'
    or car_plate ~ '^(0[1-9]|[1-7][0-9]|8[01]) ?[A-PR-VYZ]{3} ?[0-9]{2,3}$'
  ) not valid;
