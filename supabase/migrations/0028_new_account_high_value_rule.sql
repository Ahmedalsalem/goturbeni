-- Beşinci kural: "sahte ilan ver, depozito topla, kaybol" paterninin asıl
-- imzası — hesap çok yeni ve doğrudan yüksek masraf paylı bir ilan açmış.
-- Bu, mevcut dört kuraldan (hepsi *tekrar eden* davranışa bakıyor — ilan
-- yoğunluğu, iptal/red oranı) farklı: tek bir ilan bile yeterli sinyal
-- olabilir, çünkü dolandırıcı zaten "tekrar"a fırsat bulamadan kaybolur.
-- Eşik (48 saat, ₺300) makul bir varsayım — bkz. README → Bilinen
-- Sınırlamalar, gerçek kullanım verisiyle ayarlanmalı.
alter type public.suspicious_account_reason add value 'new_account_high_value';
