-- Kullanıcı kararı (2026-11-15): yeni ilan e-postası 18:00 özetini beklemesin,
-- her ilan açıldığı anda tek başına gitsin. 0104'teki "acil ilan" tetikleyicisi
-- artık kalkış saatine bakmadan her aktif, ileri tarihli ilanı yayınlıyor; 18:00
-- özet cron'u kapatıldı. post_new_ride_digest ve ride_broadcast_dispatches
-- aynen kalıyor (alıcı seçimi ve "bir ilan bir kez" kaydı).
--
-- Not: Brevo günlük limiti 300 e-posta; ~130 alıcıyla günde 2'den fazla ilan
-- açılırsa limit doluyor ve doğrulama kodu e-postaları da aynı limiti kullanıyor.
create or replace function public.broadcast_urgent_new_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.departure_time > now() then
    perform public.post_new_ride_digest(array[new.id]);
  end if;
  return null;
end;
$$;

revoke execute on function public.broadcast_urgent_new_ride() from public, anon, authenticated;

select cron.unschedule('send-new-ride-digest');
