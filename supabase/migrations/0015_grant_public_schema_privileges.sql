-- Supabase's hosted platform grants anon/authenticated the standard
-- baseline table/sequence/routine privileges on the public schema when a
-- project is first created — this has never been a migration in this repo
-- because the real linked project already had it from creation. A fresh
-- database bootstrapped via `supabase start` (e.g. CI's local instance)
-- does not get this automatically, which surfaced as "permission denied
-- for table rides" (42501) the first time this app was ever stood up from
-- migrations alone. Row-level access control is (and has always been)
-- enforced by RLS policies, not by withholding table-level grants, so this
-- is safe to apply broadly; it's a no-op on the real project.
grant usage on schema public to anon, authenticated;

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all routines in schema public to anon, authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on routines to anon, authenticated;
