-- Prod (2026-11-02): admin'in tekrar gönderimi her seferinde yeni kod yazıyordu;
-- kullanıcının daha önce aldığı e-postadaki kod geçersiz kalıyordu (0105'in
-- kullanıcı tarafında düzelttiği sorunun aynısı). Geçerli bir kod varsa artık
-- o korunuyor ve döndürülüyor, süresi yine süresize çekiliyor.
--
-- admin_resend_verification_code void döndürüyor ve dönüş tipi create or
-- replace ile değiştirilemiyor; 0105'teki gibi yeni fonksiyon, eski olan
-- uygulama geçtikten sonra kaldırılacak.
create function public.admin_resend_or_reuse_verification_code(p_user_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if p_code !~ '^[0-9]{6}$' then
    raise exception 'invalid_code';
  end if;

  update public.profiles_private
    set email_otp_code = case
          when email_otp_code is not null and email_otp_expires_at > now() then email_otp_code
          else p_code
        end,
        email_otp_expires_at = '9999-12-31 23:59:59+00'
    where id = p_user_id
    returning email_otp_code into v_code;

  if v_code is null then
    raise exception 'user_not_found';
  end if;

  return v_code;
end;
$$;

revoke execute on function public.admin_resend_or_reuse_verification_code(uuid, text) from public, anon;
grant execute on function public.admin_resend_or_reuse_verification_code(uuid, text) to authenticated;
