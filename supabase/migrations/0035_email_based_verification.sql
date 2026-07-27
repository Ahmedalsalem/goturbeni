-- Mandatory account verification moves from SMS OTP (Supabase Auth's
-- phone_change flow, via Twilio) to a custom e-mail code sent through
-- Resend (src/lib/email.ts) — real SMS delivery has a genuine per-message
-- cost with no free tier that lifts the "verified numbers only" trial
-- restriction, while e-mail delivery is already free and working. The
-- phone number itself is still collected and stored (contact/trust info),
-- it just no longer carries the verification burden.

alter table public.profiles_private
  add column email_otp_code text,
  add column email_otp_expires_at timestamptz;

-- sync_verified_phone (0010_phone_verification.sql) synced phone_verified
-- from auth.users.phone_confirmed_at, which nothing sets anymore now that
-- the app never calls auth.updateUser({ phone }) — dead code, dropped
-- rather than left around to confuse future readers.
drop trigger on_auth_user_phone_confirmed on auth.users;
drop function public.sync_verified_phone();

-- Verifies the code the user was e-mailed and flips phone_verified — kept
-- as a security definer RPC (rather than a plain client-side update) so
-- phone_verified can only become true through this exact check, not via a
-- direct write against the "update own phone" policy (0006_profiles_phone_privacy.sql).
create function public.verify_email_otp(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched boolean;
begin
  update public.profiles_private
    set phone_verified = true,
        email_otp_code = null,
        email_otp_expires_at = null
    where id = auth.uid()
      and email_otp_code = p_code
      and email_otp_expires_at > now();

  v_matched := found;
  return v_matched;
end;
$$;
