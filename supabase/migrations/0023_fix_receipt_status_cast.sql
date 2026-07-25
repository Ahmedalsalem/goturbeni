-- Canlı doğrulama sırasında bulunan gerçek hata: admin_review_deposit_receipt
-- içindeki `case when ... then 'approved' else 'rejected' end` ifadesi
-- Postgres tarafından `text` olarak çözümleniyor, hedef sütun (receipt_status
-- enum) ile eşleşmediği için "column is of type receipt_status but expression
-- is of type text" (42804) hatasıyla her çağrıda başarısız oluyordu — tek bir
-- literal atamanın (submit_deposit_receipt'teki gibi) aksine, CASE ifadesi
-- enum'a örtük cast edilmiyor. Açık `::receipt_status` cast'i ekler.

create or replace function public.admin_review_deposit_receipt(p_booking_id uuid, p_approved boolean)
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
    set deposit_receipt_status = (case when p_approved then 'approved' else 'rejected' end)::receipt_status,
        deposit_receipt_reviewed_at = now()
    where id = p_booking_id and deposit_receipt_url is not null;

  if not found then
    raise exception 'receipt_not_found';
  end if;
end;
$$;
