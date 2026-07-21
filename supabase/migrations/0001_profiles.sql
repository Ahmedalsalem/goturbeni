-- Faz 1: profiles table (auth-linked) + avatar storage. Applied via the
-- Supabase CLI migration workflow — see supabase/config.toml and the db:*
-- scripts in package.json (`npm run db:link` once per project, then
-- `npm run db:push` to apply).

-- profiles -------------------------------------------------------------------
create type profile_verification_status as enum ('unverified', 'pending', 'verified');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Length limits mirror features/profile/schemas.ts (MAX_FULL_NAME_LENGTH,
  -- MAX_PHONE_LENGTH, MAX_BIO_LENGTH) as a defense-in-depth backstop against
  -- direct API writes that bypass the app's Zod validation.
  full_name text check (char_length(full_name) <= 100),
  avatar_url text,
  phone text check (char_length(phone) <= 20),
  phone_verified boolean not null default false,
  bio text check (char_length(bio) <= 500),
  language text not null default 'tr' check (language in ('tr', 'ar')),
  verification_status profile_verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- "Herkes görebilir" — public read, no `to` clause so it applies to anon and
-- authenticated alike.
create policy "select all profiles" on public.profiles
  for select using (true);

-- "Sadece sahibi düzenleyebilir" — only the owner can update their own row.
-- No insert/delete policy: rows are created by the trigger below and never
-- deleted directly by clients.
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep updated_at current on every profile edit.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- avatars storage bucket -------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

-- Public read (bucket is public, but an explicit policy also covers the
-- storage API, not just the public URL CDN path).
create policy "select avatars" on storage.objects
  for select using (bucket_id = 'avatars');

-- Uploads/updates/deletes are restricted to the owner's own folder, keyed by
-- the first path segment being their user id (e.g. "{user_id}/avatar.png").
create policy "insert own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "update own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
