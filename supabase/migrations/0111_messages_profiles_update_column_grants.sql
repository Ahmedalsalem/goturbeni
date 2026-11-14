-- GB-SEC-005 / GB-SEC-006: the "update own received message" and "update
-- own profile" policies only check row ownership, and authenticated still
-- had Supabase's default table-wide UPDATE grant on both tables.
--
-- messages: the receiver could rewrite message and sender_id, forging chat
-- history that disputes rely on. The only direct client update is marking
-- a message read (markMessagesRead); editing and deleting go through
-- edit_message / soft_delete_message, which are SECURITY DEFINER.
revoke update on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;

-- profiles: a user could set their own created_at, deleted_at (undoing an
-- account deletion), referred_by and verification_status. Profile edits go
-- through update_own_profile / complete_registration_details /
-- delete_own_account (SECURITY DEFINER). signup_source stays writable
-- because the Google OAuth callback sets it with the user's own session
-- (src/app/auth/callback/route.ts).
revoke update on public.profiles from anon, authenticated;
grant update (signup_source) on public.profiles to authenticated;
