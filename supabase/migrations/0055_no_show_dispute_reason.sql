-- Faz 1 — ödeme koruması sıkılaştırması (bkz.
-- docs/plans/2026-08-08-passenger-listings-and-payment-protection-design.md).
-- Yeni enum değeri, kullanan fonksiyonlarla aynı migration'da/transaction'da
-- olamaz (bkz. 0041/0042'nin aynı notu) — kullanan değişiklik 0056'da.
alter type public.dispute_reason add value 'no_show';
