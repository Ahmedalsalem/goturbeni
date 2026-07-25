-- Yolcunun gönderdiği ödeme dekontunun (0017_booking_payment_flow.sql'deki
-- IBAN'a yapılan yarı-yarı ödemenin kanıtı) sisteme yüklenmesi ve
-- sürücü/admin tarafından incelenmesi. Bu, var olan "İlk Yarı Ödemesini
-- Aldım" onayının (approve_booking) yerini almaz — dekont incelemesi ek bir
-- doğrulama katmanı, mevcut mutabakat akışı aynen kalır.

create type public.receipt_status as enum ('pending', 'approved', 'rejected');

alter table public.bookings
  add column deposit_receipt_url text,
  add column deposit_receipt_status public.receipt_status,
  add column deposit_receipt_reviewed_at timestamptz;

-- payment-receipts storage bucket ---------------------------------------------
-- avatars'ın aksine PRIVATE: ödeme dekontları hassas finansal belgeler, yalnızca
-- ilgili rezervasyonun taraflarına (yolcu/sürücü) ve adminlere görünmeli.
insert into storage.buckets (id, name, public)
values ('payment-receipts', 'payment-receipts', false);

-- Yol şeması "{booking_id}/deposit-....png" ya da "{booking_id}/refund-....png"
-- (refund kısmı 0021_cancellation_refunds.sql'de kullanılacak) — klasörün ilk
-- segmenti booking id'si. Hem okuma hem yazma, o rezervasyonun yolcusu ya da
-- ilanın sürücüsü ile sınırlı; is_admin() adminlere de okuma erişimi açar.
create policy "select own booking receipts" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (
      public.is_admin()
      or exists (
        select 1 from public.bookings b
        join public.rides r on r.id = b.ride_id
        where b.id::text = (storage.foldername(name))[1]
          and (b.passenger_id = auth.uid() or r.driver_id = auth.uid())
      )
    )
  );

create policy "insert own booking receipts" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.bookings b
      join public.rides r on r.id = b.ride_id
      where b.id::text = (storage.foldername(name))[1]
        and (b.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- Yolcu, sürücünün IBAN'ına gönderdiği ödemenin dekontunu yükler. Rezervasyon
-- kendisine ait olmalı (passenger_id = auth.uid()); durum her yüklemede
-- 'pending'e döner, önceki bir red varsa yeniden yükleyip incelemeye
-- sunulabilir.
create function public.submit_deposit_receipt(p_booking_id uuid, p_receipt_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
    set deposit_receipt_url = p_receipt_url,
        deposit_receipt_status = 'pending',
        deposit_receipt_reviewed_at = null
    where id = p_booking_id and passenger_id = auth.uid();

  if not found then
    raise exception 'not_authorized';
  end if;
end;
$$;

-- Admin, yüklenen dekontu inceleyip onaylar/reddeder. admin_cancel_ride ile
-- aynı yetkilendirme deseni (0014_admin.sql).
create function public.admin_review_deposit_receipt(p_booking_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.bookings
    set deposit_receipt_status = case when p_approved then 'approved' else 'rejected' end,
        deposit_receipt_reviewed_at = now()
    where id = p_booking_id and deposit_receipt_url is not null;

  if not found then
    raise exception 'receipt_not_found';
  end if;
end;
$$;
