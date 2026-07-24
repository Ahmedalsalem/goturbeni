-- Faz 10: minimal admin panel — kullanıcı/ilan moderasyonu + temel analytics.
--
-- is_admin/is_suspended kasıtlı olarak profiles tablosuna EKLENMEDİ: profiles
-- üzerindeki mevcut "update own profile" RLS politikası satır bazlı
-- (auth.uid() = id), sütun bazlı değil — bir kullanıcı kendi profil satırını
-- güncellerken is_admin/is_suspended gibi sütunları da aynı çağrıda
-- değiştirebilirdi (Supabase REST API'ye doğrudan bir PATCH isteğiyle, app
-- kodunu tamamen atlayarak). Bu, kullanıcının kendini admin yapabilmesi
-- anlamına gelirdi — kabul edilemez bir yetki yükseltme açığı. Bunun yerine
-- ayrı bir admin_flags tablosu: hiçbir client-side insert/update/delete
-- politikası yok, tek yazma yolu aşağıdaki security-definer RPC'ler (kendi
-- içlerinde is_admin() kontrolü yapıyor) ve bu migration'daki bootstrap insert.

create table public.admin_flags (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_admin boolean not null default false,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.admin_flags enable row level security;

-- security-definer yardımcılar: hem RLS politikalarında hem RPC'lerin
-- kendi içinde tekrar tekrar kullanılıyor. `stable` + security definer,
-- admin_flags'i RLS'yi bypass ederek okur — bu tabloda zaten client-yazma
-- yolu olmadığından güvenli.
create function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.admin_flags where user_id = p_user_id), false)
$$;

create function public.is_suspended(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_suspended from public.admin_flags where user_id = p_user_id), false)
$$;

-- Kendi satırını (admin panelde "ben admin miyim" kontrolü, verifySession'da
-- "ben askıya alındım mı" kontrolü için) veya adminse herkesin satırını
-- okuyabilir (kullanıcı yönetimi listesi için).
create policy "select own or admin sees all" on public.admin_flags
  for select using (auth.uid() = user_id or public.is_admin());

-- Kasıtlı olarak insert/update/delete politikası YOK — bkz. yukarıdaki not.

-- İlk admin: kullanıcının onayladığı e-posta ile giriş yapan hesap.
insert into public.admin_flags (user_id, is_admin)
select id, true from auth.users where email = 'alsalemahmed2010@gmail.com'
on conflict (user_id) do update set is_admin = true;

-- Kullanıcı askıya alma/aktifleştirme. Kendi kendini askıya almasını
-- engeller (kilitlenme riski). upsert: admin_flags satırı henüz yoksa
-- (varsayılan false/false ile) oluşturur.
create function public.admin_set_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_suspend_self';
  end if;

  insert into public.admin_flags (user_id, is_suspended)
  values (p_user_id, p_suspended)
  on conflict (user_id) do update set is_suspended = p_suspended;
end;
$$;

-- Bir admin başka bir kullanıcıya admin yetkisi verebilir/alabilir. Kendi
-- kendini admin'likten çıkarmasını engeller (tüm adminlerin kilitlenmesi
-- riskine karşı basit bir bariyer — tek koruma bu değil ama ucuz bir
-- backstop).
create function public.admin_set_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_admin_status';
  end if;

  insert into public.admin_flags (user_id, is_admin)
  values (p_user_id, p_is_admin)
  on conflict (user_id) do update set is_admin = p_is_admin;
end;
$$;

-- Admin bir ilanı kaldırır (iptal eder). "update own ride" politikası
-- driver_id = auth.uid() gerektirdiğinden admin'i kapsamaz — bu RPC ayrı bir
-- yetkilendirme yolu açar. Yalnızca hâlâ 'active'/'full' olan ilanlar
-- kaldırılabilir (tamamlanmış/zaten iptal edilmiş bir ilanın durumu
-- anlamsızca değiştirilmesin diye).
create function public.admin_cancel_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.rides
  set status = 'cancelled'
  where id = p_ride_id and status in ('active', 'full');

  if not found then
    raise exception 'ride_not_cancellable';
  end if;
end;
$$;

-- Askıya alınmış bir kullanıcı yeni ilan/rezervasyon/mesaj/yorum
-- oluşturamaz (mevcut içeriği görmeye/okumaya devam eder — bu bir "sessiz
-- moderasyon", auth.users seviyesinde tam ban değil; gerçek bir ban,
-- service_role/Supabase Admin API gerektirir ve bu proje bilinçli olarak
-- service_role kullanmıyor, bkz. README → Environment Variables). Mevcut
-- politikalar drop edilip aynı isimle (with check'e suspension koşulu
-- eklenerek) yeniden oluşturuluyor — eski migration dosyaları asla
-- düzenlenmez, bu yüzden yeni bir migration'da drop+recreate yapılıyor.

drop policy "insert own ride" on public.rides;
create policy "insert own ride" on public.rides
  for insert to authenticated
  with check (auth.uid() = driver_id and not public.is_suspended());

drop policy "insert own booking" on public.bookings;
create policy "insert own booking" on public.bookings
  for insert to authenticated
  with check (auth.uid() = passenger_id and not public.is_suspended());

drop policy "insert own message" on public.messages;
create policy "insert own message" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and not public.is_suspended()
    and sender_id <> receiver_id
    and exists (
      select 1 from public.rides r
      where r.id = messages.ride_id
        and (
          (r.driver_id = messages.sender_id and exists (
            select 1 from public.bookings b
            where b.ride_id = r.id and b.passenger_id = messages.receiver_id and b.status = 'approved'
          ))
          or
          (r.driver_id = messages.receiver_id and exists (
            select 1 from public.bookings b
            where b.ride_id = r.id and b.passenger_id = messages.sender_id and b.status = 'approved'
          ))
        )
    )
  );

drop policy "insert own review" on public.reviews;
create policy "insert own review" on public.reviews
  for insert to authenticated
  with check (
    auth.uid() = reviewer_id
    and not public.is_suspended()
    and reviewer_id <> reviewed_user_id
    and exists (
      select 1 from public.rides r
      where r.id = reviews.ride_id
        and r.departure_time < now()
        and (
          (r.driver_id = reviews.reviewer_id and exists (
            select 1 from public.bookings b
            where b.ride_id = r.id and b.passenger_id = reviews.reviewed_user_id and b.status = 'approved'
          ))
          or
          (r.driver_id = reviews.reviewed_user_id and exists (
            select 1 from public.bookings b
            where b.ride_id = r.id and b.passenger_id = reviews.reviewer_id and b.status = 'approved'
          ))
        )
    )
  );
