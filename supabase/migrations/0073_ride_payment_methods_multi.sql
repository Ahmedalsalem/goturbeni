-- Kullanıcı talebi: ödeme yönteminde artık ikisi de seçilebilsin (sürücü
-- hem havale hem nakit kabul edebilir), tek seçimli enum yerine.
-- ride_payment_method enum tipi (0064) korunuyor, sadece kolon tekil
-- değerden diziye dönüşüyor. Mevcut veri kaybolmasın diye eski kolonun
-- tek değeri tek elemanlı bir diziye taşınıyor.
alter table public.rides
  add column payment_methods public.ride_payment_method[] not null default array['bank_transfer']::public.ride_payment_method[];

update public.rides set payment_methods = array[payment_method]::public.ride_payment_method[];

alter table public.rides
  add constraint rides_payment_methods_not_empty check (array_length(payment_methods, 1) > 0);

alter table public.rides drop column payment_method;
