-- Nakit ödeme seçeneği: sürücü ilan verirken ödeme yöntemini seçer
-- ('bank_transfer' | 'cash'). Yolcu ilanlarında (posted_by_role='passenger')
-- henüz bir sürücü atanmamış olduğundan bu seçim anlamsız — RideForm bu
-- alanı yolcu modunda hiç göstermiyor, kayıt her zaman varsayılan
-- 'bank_transfer' ile açılıyor (Task 3, buildRideSchema'nın transform'u).
--
-- 'cash' seçilen yolculuklarda mevcut dekont/OCR akışı (SettlementReceiptUpload,
-- submit_settlement_receipt/_ocr) hiç kullanılmıyor — yalnızca zaten var olan,
-- dekontsuz karşılıklı onay (confirm_remaining_payment RPC,
-- 0017_booking_payment_flow.sql) kullanılabiliyor. O RPC zaten dekonta hiç
-- bakmıyor (salt karşılıklı "gönderdim/aldım" bayrağı), bu yüzden burada
-- hiçbir fonksiyon değişikliği gerekmiyor — sadece UI'ın hangi bileşenleri
-- gösterdiği değişiyor (Task 4/5).
create type public.ride_payment_method as enum ('bank_transfer', 'cash');

alter table public.rides
  add column payment_method public.ride_payment_method not null default 'bank_transfer';
