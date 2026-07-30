-- Kural-tabanlı dolandırıcılık tespiti v2: yeni sinyaller için gereken enum
-- değerleri ve sayaç kolonları. Postgres, aynı transaction içinde eklenen bir
-- enum değerini kullanmaya izin vermez (bkz. 0041/0042'nin aynı gerekçesi) —
-- bu yüzden enum ekleme (bu migration) ile kullanım (0046) ayrı tutulur.

alter type public.suspicious_account_reason add value 'duplicate_iban';
alter type public.suspicious_account_reason add value 'disputed_repeatedly';
alter type public.suspicious_account_reason add value 'repeated_receipt_rejection';

-- Ömür boyu (lifetime) red sayaçları — yeniden yüklemede status pending'e
-- dönse de bu sayaç sıfırlanmaz, tekrar tekrar geçersiz/sahte dekont
-- yükleme davranışını ölçmek içindir.
alter table public.bookings
  add column deposit_receipt_reject_count integer not null default 0,
  add column settlement_receipt_reject_count integer not null default 0,
  add column refund_reject_count integer not null default 0;

-- Mevcut inceleme RPC'leri, reddedildiğinde ilgili sayaçları artıracak
-- şekilde güncelleniyor (imza değişmiyor, yalnızca gövde).
create or replace function public.admin_review_deposit_receipt(p_booking_id uuid, p_approved boolean, p_reason text default null)
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
        deposit_receipt_reviewed_at = now(),
        deposit_receipt_reject_reason = case when p_approved then null else p_reason end,
        deposit_receipt_reject_count = deposit_receipt_reject_count + (case when p_approved then 0 else 1 end)
    where id = p_booking_id and deposit_receipt_url is not null;

  if not found then
    raise exception 'receipt_not_found';
  end if;
end;
$$;

create or replace function public.admin_review_settlement_receipt(p_booking_id uuid, p_approved boolean, p_reason text default null)
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
    set settlement_receipt_status = (case when p_approved then 'approved' else 'rejected' end)::receipt_status,
        settlement_receipt_reviewed_at = now(),
        settlement_receipt_reject_reason = case when p_approved then null else p_reason end,
        settlement_receipt_reject_count = settlement_receipt_reject_count + (case when p_approved then 0 else 1 end)
    where id = p_booking_id and settlement_receipt_url is not null;

  if not found then
    raise exception 'receipt_not_found';
  end if;
end;
$$;

create or replace function public.admin_reject_refund_proof(p_booking_id uuid, p_reason text default null)
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
    set refund_status = 'pending',
        refund_reject_reason = p_reason,
        refund_reject_count = refund_reject_count + 1
    where id = p_booking_id and refund_status = 'proof_submitted';

  if not found then
    raise exception 'refund_not_ready';
  end if;
end;
$$;
