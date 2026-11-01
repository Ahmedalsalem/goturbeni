-- 0105'teki store_or_reuse_email_otp, 16333af ile yayına alındı; uygulama
-- artık store_email_otp'yi (0099) çağırmıyor.
drop function public.store_email_otp(text, text);
