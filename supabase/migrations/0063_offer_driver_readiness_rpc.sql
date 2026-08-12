-- İlan sahibi bir teklifi onaylamadan önce, teklif veren sürücünün IBAN ve
-- plaka bilgisinin dolu olup olmadığını kontrol edebilmesi gerekiyor
-- (approveBooking, src/features/bookings/actions.ts) — sürücü henüz
-- kendisi değil, ilan sahibi (yolcu) bu kontrolü tetikliyor.
--
-- Bu kontrol şu ana kadar approveBooking içinde doğrudan
-- `supabase.from("profiles_private").select(...).eq("id", offeringDriverId)`
-- ile yapılıyordu — ama profiles_private yalnızca SAHİBİ tarafından
-- okunabilir (0006_profiles_phone_privacy.sql: "select own phone" politikası
-- `auth.uid() = id` şartıyla). İlan sahibi (yolcu) kendi auth.uid()'i ile
-- BAŞKA birinin (sürücünün) profiles_private satırını sorgulamaya
-- çalıştığından RLS her seferinde SIFIR satır döndürüyordu — sürücünün IBAN'ı
-- gerçekten dolu olsa bile paymentInfo hep null geliyor, approveBooking hep
-- "offerDriverIbanRequired" ile reddediyordu. Sonuç: bir yolcu ilanına
-- verilen HİÇBİR teklif hiçbir zaman onaylanamıyordu — canlı Playwright'ın
-- bu oturumda ilk kez CI'da gerçekten çalıştırılmasıyla ortaya çıktı (bkz.
-- ilgili PR tartışması), önceki hiçbir statik inceleme bunu yakalayamamıştı.
--
-- get_ride_driver_payment_info (0017) burada işe yaramıyor çünkü o
-- rides.driver_id üzerinden çözüyor — bu alan onay ANINDA _apply_booking_
-- approval tarafından dolduruluyor, onaydan ÖNCE (tam da bu kontrolün
-- çalıştığı an) hâlâ NULL. Bu yeni fonksiyon bookings.driver_id (teklif
-- veren sürücünün id'si, teklif oluşturulduğu andan beri dolu — bkz.
-- createOffer, src/features/bookings/actions.ts) üzerinden çözüyor.
--
-- get_ride_driver_payment_info ile aynı yetkilendirme deseni: çağıranın
-- gerçekten bu teklifin ilan sahibi (passenger_id) olduğu doğrulanmadan
-- hiçbir satır dönmüyor. Plaka FORMATININ geçerliliği zaten
-- profiles.car_plate_format_check (0051_car_plate_format_check.sql) ile DB
-- seviyesinde garanti altında olduğundan burada yalnızca null olup olmadığı
-- kontrol ediliyor — regex'i burada tekrar etmeye gerek yok.
create function public.get_offer_driver_readiness(p_booking_id uuid)
returns table (iban_ok boolean, plate_ok boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found or v_booking.passenger_id <> auth.uid() or v_booking.booker_role <> 'driver' then
    raise exception 'not_authorized';
  end if;

  -- profiles her kullanıcı için signup tetikleyicisiyle garanti var (0001),
  -- profiles_private ise yalnızca ilk telefon/IBAN yazımında oluşuyor —
  -- LEFT JOIN, sürücü hiç IBAN girmemişse bile tam olarak bir satır (her
  -- iki alan da false) dönmesini garanti ediyor.
  return query
    select
      (pp.iban is not null and pp.iban_holder_name is not null),
      (p.car_plate is not null)
    from public.profiles p
    left join public.profiles_private pp on pp.id = p.id
    where p.id = v_booking.driver_id;
end;
$$;
