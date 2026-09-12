-- Kullanıcı isteği: USB şarj / klima da (0070'in eski car_features
-- checklist'inden kaldırılmıştı) large_luggage_ok/child_seat_available/
-- wheelchair_accessible (0085) ile aynı tek-tık boolean stiline taşınıyor —
-- ayrıca bu ikisi arama filtresine de bağlanacak (0070 sonrası car_features
-- hiç bir zaman bir arama filtresi olmamıştı, bu ikisi ilk).
alter table public.rides
  add column usb_charger_available boolean not null default false,
  add column ac_available boolean not null default false;

alter table public.ride_series
  add column usb_charger_available boolean not null default false,
  add column ac_available boolean not null default false;

create or replace function public.generate_recurring_rides()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series record;
  v_local_today date;
  v_next_local_date date;
  v_next_departure timestamptz;
begin
  v_local_today := (now() at time zone 'Europe/Istanbul')::date;

  for v_series in select * from public.ride_series where is_active loop
    v_next_local_date := v_local_today + ((v_series.weekday - extract(dow from v_local_today)::int + 7) % 7);
    v_next_departure := (v_next_local_date + v_series.departure_time_of_day) at time zone 'Europe/Istanbul';
    if v_next_departure < now() then
      v_next_departure := v_next_departure + interval '7 days';
    end if;

    if v_next_departure - now() <= make_interval(days => v_series.lead_days)
      and not exists (
        select 1 from public.rides
        where series_id = v_series.id and departure_time = v_next_departure
      )
      and exists (
        select 1 from public.profiles_private pp
        where pp.id = v_series.driver_id and pp.iban is not null and pp.iban_holder_name is not null
      )
    then
      insert into public.rides (
        driver_id, posted_by, departure_city, arrival_city, departure_district, arrival_district,
        departure_time, seat_count, available_seats, cost_share, description,
        pets_allowed, smoking_allowed, large_luggage_ok, child_seat_available, wheelchair_accessible,
        usb_charger_available, ac_available, series_id
      ) values (
        v_series.driver_id, v_series.driver_id, v_series.departure_city, v_series.arrival_city,
        v_series.departure_district, v_series.arrival_district,
        v_next_departure, v_series.seat_count, v_series.seat_count, v_series.cost_share, v_series.description,
        v_series.pets_allowed, v_series.smoking_allowed, v_series.large_luggage_ok, v_series.child_seat_available,
        v_series.wheelchair_accessible, v_series.usb_charger_available, v_series.ac_available, v_series.id
      );
    end if;
  end loop;
end;
$$;

-- rides has column-level (not table-level) update grants for `authenticated`
-- (0058) — every migration that adds a rides column must redo this, see 0074.
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ') into v_columns
    from pg_attribute
    where attrelid = 'public.rides'::regclass
      and attnum > 0
      and not attisdropped
      and attname not in ('driver_id', 'posted_by_role');
  execute format('grant update (%s) on public.rides to authenticated', v_columns);
end $$;

-- Kullanıcı isteği: bir hesabın doğrulama e-postası spam'e düşmüş olabilir —
-- admin panelinden doğrulanmamış bir hesaba yeni bir kod gönderebilmek için.
-- Normal sendEmailVerificationCode (features/profile/actions.ts) auth.uid()'a
-- kilitli (yalnızca kendi kodunu üretebilir) — burada admin BAŞKA bir
-- kullanıcının profiles_private satırını yazıyor, admin_get_user_emails
-- (0068)/admin_set_suspended (0014) ile aynı admin-gated security-definer
-- desen. p_code, çağıran (features/admin/actions.ts) tarafından üretiliyor
-- (normal akışla aynı 6 haneli üretim), yalnızca expires_at burada normalin
-- 10 dakikası yerine kasıtlı olarak çok uzak bir tarih — "süresiz" isteği.
create function public.admin_resend_verification_code(p_user_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.profiles_private
    set email_otp_code = p_code,
        email_otp_expires_at = '9999-12-31 23:59:59+00'
    where id = p_user_id;

  if not found then
    raise exception 'user_not_found';
  end if;
end;
$$;
