-- Faz 6: reviews table — bir yolculuk tamamlandıktan (kalkış zamanı geçmiş,
-- onaylanmış bir rezervasyon üzerinden) sonra sürücü ve yolcunun birbirini
-- değerlendirmesi. "Tamamlandı" burada rides.status = 'completed' olarak
-- ayrıca izlenmez (bkz. README → Bilinen Sınırlamalar: bu enum değerine
-- otomatik geçiş yok) — bunun yerine departure_time < now() ile hesaplanır,
-- tıpkı bu politikanın WITH CHECK'inde yaptığı gibi.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewed_user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  -- Mirrors MAX_COMMENT_LENGTH in features/reviews/schemas.ts.
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);

-- "Bir kullanıcı aynı yolculuk için yalnızca bir kez yorum yazabilir."
create unique index reviews_one_per_reviewer_per_ride on public.reviews (ride_id, reviewer_id);

create index reviews_reviewed_user_id_idx on public.reviews (reviewed_user_id);
create index reviews_ride_id_idx on public.reviews (ride_id);

alter table public.reviews enable row level security;

-- "Herkes okuyabilir" — public read, no `to` clause: profil ve ilan detay
-- sayfalarındaki puan/yorum gösterimi misafirler için de çalışmalı.
create policy "select all reviews" on public.reviews
  for select using (true);

-- Yalnızca kendi adına, ve yalnızca gerçekten o yolculukta karşılıklı
-- onaylanmış bir rezervasyonu olan taraf hakkında yorum yazabilir:
-- sürücüyse onayladığı bir yolcu hakkında, yolcuysa o ilanın sürücüsü
-- hakkında. Yolculuğun kalkış zamanı geçmemişse ("tamamlanmamışsa") insert
-- reddedilir. Race condition riski yok (bookings'in aksine), bu yüzden
-- security-definer bir RPC yerine düz RLS ile ifade ediliyor.
create policy "insert own review" on public.reviews
  for insert to authenticated
  with check (
    auth.uid() = reviewer_id
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

-- Kasıtlı olarak update/delete policy'si YOK: yorumlar gönderildikten sonra
-- değiştirilemez/silinemez (immutable), updated_at kolonu da bu yüzden yok.
