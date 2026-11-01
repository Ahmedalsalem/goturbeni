-- Prod verisi (2026-11-01): doğrulama kodunu birkaç dakika içinde 2-3 kez
-- isteyen kullanıcıların neredeyse hiçbiri doğrulanamadı (6'da 1), tek kez
-- isteyenlerin çoğu doğrulandı (10'da 7). Her istek yeni bir kod üretip
-- öncekinin üzerine yazıyordu; kullanıcı elindeki ilk e-postadaki kodu
-- girince "kod hatalı" görüyordu. Kod süresi dolmadıysa artık aynı kod
-- tekrar gönderiliyor, süresi de en az 10 dakikaya uzatılıyor (admin'in
-- süresiz kodu, 0086, kısalmasın diye greatest).
--
-- store_email_otp void döndürdüğü ve dönüş tipi create or replace ile
-- değiştirilemediği için yeni bir fonksiyon: migration deploy'dan önce
-- uygulanınca eski kod eski fonksiyonu kullanmaya devam edebiliyor.
-- store_email_otp sonraki bir migration'da kaldırılacak.
create function public.store_or_reuse_email_otp(p_code text, p_secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select value into v_secret from public.cron_config where key = 'email_otp_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'not_authorized';
  end if;

  if p_code !~ '^[0-9]{6}$' then
    raise exception 'invalid_code';
  end if;

  update public.profiles_private
    set email_otp_code = case
          when email_otp_code is not null and email_otp_expires_at > now() then email_otp_code
          else p_code
        end,
        email_otp_expires_at = case
          when email_otp_code is not null and email_otp_expires_at > now()
            then greatest(email_otp_expires_at, now() + interval '10 minutes')
          else now() + interval '10 minutes'
        end
    where id = auth.uid()
    returning email_otp_code into v_code;

  return v_code;
end;
$$;

revoke execute on function public.store_or_reuse_email_otp(text, text) from public, anon;
grant execute on function public.store_or_reuse_email_otp(text, text) to authenticated;
