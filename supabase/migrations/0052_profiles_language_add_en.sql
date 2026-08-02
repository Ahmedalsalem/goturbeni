-- profiles.language had a check(language in ('tr', 'ar')) since 0001 — adding
-- English as a supported locale (src/i18n/locale-config.ts SUPPORTED_LOCALES)
-- without updating this would make update_own_profile fail with a check
-- constraint violation for any user who picks English as their profile
-- language preference.
alter table public.profiles
  drop constraint profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check check (language in ('tr', 'ar', 'en'));
