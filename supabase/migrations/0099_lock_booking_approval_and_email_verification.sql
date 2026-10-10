-- Security fixes from AUDIT_REPORT.md (GB-SEC-001, GB-SEC-003).

-- GB-SEC-001: _apply_booking_approval is a SECURITY DEFINER helper with no
-- caller check, but Supabase grants EXECUTE on every public function to
-- anon/authenticated by default — anyone, even logged out, could call it
-- over /rest/v1/rpc to approve any booking, rewrite any ride's cost_share or
-- assign themselves as a passenger listing's driver. Its only legitimate
-- callers are approve_booking and create_booking (both SECURITY DEFINER, so
-- they run as the function owner and keep working after this revoke).
revoke execute on function public._apply_booking_approval(uuid, uuid, integer, uuid, numeric) from public, anon, authenticated;

-- GB-SEC-003: the owner-only RLS policies on profiles_private didn't limit
-- columns, so a user could read their own email_otp_code or simply set
-- email_verified = true over the Data API, skipping email verification.
-- Users keep column-level access to the fields they legitimately edit;
-- email_verified becomes read-only and the OTP columns invisible to them.
revoke select, insert, update on public.profiles_private from anon, authenticated;
grant select (id, phone, email_verified, gender, iban, iban_holder_name, date_of_birth, email_notifications_enabled)
  on public.profiles_private to authenticated;
grant update (phone, gender, iban, iban_holder_name, date_of_birth, email_notifications_enabled)
  on public.profiles_private to authenticated;

-- These three write email_verified (only ever resetting it to false) and
-- were SECURITY INVOKER, so they'd now fail on the revoked column. Every
-- statement in them is scoped to auth.uid(), so running them as the owner
-- doesn't widen what a caller can touch.
alter function public.update_own_profile(text, text, text, text, text, text, text, text, text, text, text, text[], text[], boolean) security definer;
alter function public.complete_registration_details(text, text, text, date, boolean) security definer;
alter function public.delete_own_account() security definer;

-- The verification code used to be written by sendEmailVerificationCode with
-- the user's own session, which let a user pick their own code. Storing it
-- now requires a server-only secret: cron_config 'email_otp_secret' must
-- equal the Next.js server's EMAIL_OTP_SECRET env var. The value is set
-- out-of-band (never committed); until it is, store_email_otp refuses.
create function public.store_email_otp(p_code text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
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
    set email_otp_code = p_code,
        email_otp_expires_at = now() + interval '10 minutes'
    where id = auth.uid();
end;
$$;

revoke execute on function public.store_email_otp(text, text) from public, anon;
grant execute on function public.store_email_otp(text, text) to authenticated;
