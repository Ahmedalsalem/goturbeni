-- Ödeme dekontu incelemesi tek admin'e bağlı, tamamen manuel ve otomasyon
-- yoktu — 10-20 rezervasyon/gün'de bile bu boğar. OCR/banka API doğrulaması
-- olmadan (bkz. README → Bilinen Sınırlamalar) dekonttaki tutarı otomatik
-- doğrulayamayız; bunun yerine admin/features/risk.ts'teki kural-tabanlı
-- güven seviyesi (hesap yaşı, şüpheli hesap değil, geçmiş red yok, açık
-- anlaşmazlık yok) ile "düşük riskli" işaretlenen dekontları admin'in tek
-- tıkla toplu onaylamasına izin verir — otomasyon tıklamayı azaltır, admin
-- onayını ortadan kaldırmaz (her satır yine *_reviewed_at ile damgalanır).
create function public.admin_bulk_approve_receipts(p_booking_ids uuid[], p_kind text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if p_kind not in ('deposit', 'settlement') then
    raise exception 'invalid_kind';
  end if;

  if p_kind = 'deposit' then
    update public.bookings
      set deposit_receipt_status = 'approved',
          deposit_receipt_reviewed_at = now(),
          deposit_receipt_reject_reason = null
      where id = any (p_booking_ids) and deposit_receipt_status = 'pending';
  else
    update public.bookings
      set settlement_receipt_status = 'approved',
          settlement_receipt_reviewed_at = now(),
          settlement_receipt_reject_reason = null
      where id = any (p_booking_ids) and settlement_receipt_status = 'pending';
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
