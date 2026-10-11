-- Product decision (2026-10-11): the platform no longer collects IBANs and
-- drops the receipt (dekont) workflow entirely. Bank transfer stays a
-- payment option — the driver shares their IBAN in chat — and every booking
-- settles the same way cash already did: both sides confirm via
-- confirm_remaining_payment. Removing these also closes AUDIT_REPORT.md
-- GB-SEC-004 (submit_settlement_receipt_ocr trusted client-supplied OCR
-- results and could mark a booking paid with no receipt at all).
--
-- The underlying bookings columns (settlement_receipt_*, refund_*,
-- settlement_ocr_*) and the payment-receipts bucket are left in place:
-- dropping them buys nothing and would only make old rows unreadable.

drop function public.submit_settlement_receipt(uuid, text);
drop function public.submit_settlement_receipt_ocr(uuid, text, numeric[]);
drop function public.admin_review_settlement_receipt(uuid, boolean, text);
drop function public.admin_bulk_approve_receipts(uuid[]);
drop function public.submit_refund_proof(uuid, text);
drop function public.admin_confirm_refund(uuid);
drop function public.admin_reject_refund_proof(uuid, text);
drop function public.get_ride_driver_payment_info(uuid);
drop function public.admin_get_driver_payment_info(uuid);

-- No more IBAN on the profile: users can't write it, and what was stored
-- before is cleared rather than kept around unused.
revoke update (iban, iban_holder_name) on public.profiles_private from authenticated;
revoke select (iban, iban_holder_name) on public.profiles_private from authenticated;
update public.profiles_private set iban = null, iban_holder_name = null where iban is not null or iban_holder_name is not null;
