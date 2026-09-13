-- Kullanıcı isteği: yolcu ilanında net bir saat yerine "gün boyu esnek"
-- seçilebilsin (sürücü ilanında anlamsız — sürücü gerçek kalkış saatini
-- taahhüt eder). ride_series'e eklenmedi: repeatWeekly zaten yalnızca sürücü
-- ilanında var (schemas.ts'in passenger-mode transform'u sıfırlıyor), yolcu
-- ilanı hiç seri oluşturmuyor.
alter table public.rides
  add column time_flexible boolean not null default false;

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
