-- deposit_deadline_at (0017_booking_payment_flow.sql, varsayılan booking
-- oluşturulduktan 1 saat sonrası) hiç otomatik uygulanmıyordu: yolcu süresi
-- içinde IBAN'a ödeme yapıp sürücü de onaylamazsa (approve_booking, ki bu
-- aynı zamanda sürücünün "ödemeyi aldım" onayı) "pending" rezervasyon
-- süresiz beklemede kalıyordu. pg_cron her dakika çalışıp süresi geçmiş,
-- hâlâ ödeme onayı almamış talepleri iptal eder — 0011_ride_auto_complete.sql
-- ile aynı desen (security definer, RLS bypass; pg_cron extension'ı zaten
-- 0011'de açıldı). Onaylanmış (approved) rezervasyonlar bu fonksiyonun
-- kapsamı dışındadır — approve_booking zaten koltuğu düşürüp
-- payment_status'u deposit_confirmed'e taşımıştı, deadline'ın onlar için bir
-- anlamı kalmaz.
create function public.cancel_expired_pending_bookings()
returns void
language sql
security definer
set search_path = public
as $$
  update public.bookings
  set status = 'cancelled'
  where status = 'pending'
    and payment_status = 'awaiting_deposit'
    and deposit_deadline_at < now();
$$;

select cron.schedule('cancel-expired-pending-bookings', '* * * * *', $$select public.cancel_expired_pending_bookings()$$);
