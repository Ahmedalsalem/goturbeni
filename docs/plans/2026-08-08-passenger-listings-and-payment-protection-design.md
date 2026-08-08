# Tasarım: Yolcu İlanları + Ödeme Koruması Sıkılaştırması

Tarih: 2026-08-08
Durum: Onaylandı (fikir alışverişi tamamlandı), uygulamaya hazır

## Kapsam

İki bağımsız ama ilişkili değişiklik:

1. **Yolcu ilanları** — şu an sadece sürücüler ilan açabiliyor (`rides`, sürücü güzergah/tarih/koltuk/masraf payı belirler, yolcu rezervasyon talebi açar). Yolcular da aynı şekilde ilan açabilecek ("X'ten Y'ye gidecek N kişiyiz"), sürücüler bu ilanlara teklif verip *ters rezervasyon* yapabilecek.
2. **Ödeme koruması** — mevcut depozito akışı (yolcu, sürücünün IBAN'ına doğrudan %50 gönderir) sürücü no-show'unda hiçbir otomatik koruma sağlamıyor. Süreç sıkılaştırılıyor + depozito oranı %50 → %25.

İki değişiklik bağımsız olarak deploy edilebilir; sırayı Faz 1 (ödeme koruması, küçük) → Faz 2 (yolcu ilanları, büyük) olarak öneriyorum çünkü Faz 2, Faz 1'in ürettiği "no-show → otomatik dispute" mekanizmasına zaten dayanıyor (rolü ne olursa olsun aynı `report_no_show`/`disputes` altyapısı kullanılıyor).

---

## Faz 1 — Ödeme Koruması Sıkılaştırması

**Bulgu (kod okunarak doğrulandı):** `report_no_show` (`0041_no_show_and_late_cancellation.sql`) sadece `driver_no_show`/`passenger_no_show` boolean'ını işaretliyor, hiçbir otomatik sonucu yok. Şüpheli hesap kuralı (`0042_suspicious_accounts_no_show_rules.sql`) eşiği `count(*) >= 2` — yani **ilk** no-show admin'in listesine bile düşmüyor. Platform parayı hiç tutmuyor (P2P IBAN transferi + dekont/OCR), bu yüzden gerçek para iadesi zorlaması yapılamıyor; bu değişiklikler riski azaltır ve süreci otomatikleştirir, parayı geri getirmez.

**Migration `0055_no_show_tightening.sql`:**
- `dispute_reason` enum'ına `'no_show'` değeri eklenir.
- `report_no_show` fonksiyonu: `driver_no_show`/`passenger_no_show` set edilirken aynı transaction'da `disputes` tablosuna otomatik satır ekler (mağdur taraf `opened_by`, karşı taraf `against_user_id`, `reason = 'no_show'`, açıklama sistem tarafından üretilir). Zaten açık bir dispute varsa (`disputes_one_active_per_booking_opener`) `on conflict do nothing` ile sessizce atlanır.
- `admin_get_suspicious_accounts`: `frequent_driver_no_show`/`frequent_passenger_no_show` kollarında `having count(*) >= 2` → `>= 1`. Geç iptal kuralı (`frequent_late_cancellation`) `>= 2`'de kalır.
- `confirm_remaining_payment`, `submit_settlement_receipt`, `submit_settlement_receipt_ocr`: `driver_no_show = true` ise reddedilir (yeni bir `raise exception 'driver_no_show'`), yolcu gelmeyen sürücüye ikinci yarıyı ödemeye zorlanmaz.

**Depozito oranı %50 → %25:**
- SQL: `submit_deposit_receipt_ocr` (`0053`) ve `submit_settlement_receipt_ocr` (`0054`) içindeki `v_ride.cost_share * v_booking.seat_count * 0.5` → `* 0.25`. Aynı migration'da (`0055`) güncellenir.
- i18n: `messages/tr.json` (`depositInstructionTitle` "%50" → "%25", `confirmApprove`/`description`/`directDescription`'daki "yarı"/"half" ifadeleri "%25"/"dörtte biri" gibi orana özgü ifadeye çevrilir), aynı değişiklik `en.json` ve `ar.json`'da. Şu an "yarı" (half) kelimesi kullanıldığı için bu salt sayı değişikliği değil, cümle değişikliği.
- Sabit bir `DEPOSIT_RATIO = 0.25` değeri yoksa (kontrol edilecek) `src/features/bookings` içine eklenip her yerde (varsa client-side gösterilen tutar hesaplamaları) buradan okunmalı — hardcoded `0.5`'in tekrar dağılmasını önlemek için.

**Test etkisi:** `e2e/payment-review.spec.ts`, `e2e/receipt-ocr-auto-approval.spec.ts` %50 varsayımıyla tutar hesaplıyor olabilir — %25'e güncellenmeli. `src/features/bookings/actions.test.ts`'e no-show → otomatik dispute + eşik testleri eklenir.

---

## Faz 2 — Yolcu İlanları (Ters Rezervasyon)

**Karar özeti (fikir alışverişinde onaylandı):**
- Sürücü, yolcu ilanına doğrudan teklif verip rezervasyon yapabilir (tam teşekküllü ters rezervasyon, sadece pano+chat değil).
- Var olan `rides`/`bookings` şeması genişletilir (paralel yeni tablo yok).
- Bir yolcu ilanı (N kişilik grup) tek bir sürücü tarafından karşılanır — kısmi/bölünmüş teklif yok. Teklif kabul edilince ilan kapanır (mevcut "seat_count dolunca kapanır" mantığıyla birebir aynı).

**Şema (`rides`):**
- Yeni kolon `posted_by_role` enum (`'driver' | 'passenger'`), default `'driver'` (geriye dönük uyum).
- `driver_id` **nullable** olur (şu an `not null`). Yolcu ilanında oluşturma anında `NULL`; sürücünün teklifi onaylanınca dolar.
- Yolcu ilanında anlamı değişen/geçersiz alanlar: `vip_solo`, `pets_allowed`, `smoking_allowed`, `car_plate` doğrulaması — bunlar sürücünün araç politikası, ilan sahibi henüz sürücü değilse anlamsız. Bu alanlar yolcu ilanı formunda **gizlenir**, DB'de `false`/`null` kalır; teklif veren sürücü kendi araç politikasını kendi profilinden zaten taşıyor (yeni bir alan gerekmiyor, mevcut `profiles.car_plate` kullanılıyor).
- `seat_count`/`available_seats`: yolcu ilanında "ihtiyaç duyulan koltuk sayısı" anlamına gelir, mekanik aynı kalır (tek teklif kabulünde `available_seats - seat_count = 0` olup ilan kapanır).
- `cost_share`: yolcu ilanında "teklif ettiğim/ödemeyi düşündüğüm masraf payı" anlamına gelir — sürücü teklif verirken bu değeri görür, aynen kabul eder (pazarlık chat üzerinden, ek bir "karşı teklif" mekanizması bu fazın kapsamında değil).

**Şema (`bookings`):**
- Yeni kolon `booker_role` enum (`'driver' | 'passenger'`), default `'passenger'`.
- Sürücü bir yolcu ilanına "teklif" verdiğinde: `bookings` satırı `booker_role = 'driver'`, `passenger_id` = ilan sahibi (yolcu ilanını açan kişi — kolon adı `passenger_id` kalır, "rezervasyonun yolcu tarafı" anlamında, `booker_role` ile kim başlattığı ayrılır).
- `approve_booking` RPC'si genişler: eğer ilan `posted_by_role = 'passenger'` ve teklif onaylanıyorsa, aynı transaction'da `rides.driver_id` = teklif veren sürücü olarak set edilir. Bu noktada sürücünün IBAN + plaka kontrolü yapılır (şu an `createRide`'da yapılan kontrol, bu yol için `approve_booking`'e taşınır/eklenir).
- Depozito akışı zamanlaması: yolcu ilanında IBAN/plaka kontrolü ilan açılışında değil, **sürücünün teklifi ilan sahibi tarafından onaylandığı anda** yapılır (Bölüm 1'de tartışılan zorunlu sonuç).

**RLS:** `rides` select/update politikaları `driver_id is null` durumunu hesaba katmalı (yolcu ilanı herkese görünür olmalı, ama `driver_id` henüz atanmamışken "sürücü düzenleyebilir" politikası uygulanamaz — sadece `posted_by_role = 'passenger'` ise ilan sahibi `passenger_id` üzerinden düzenler, bu zaten `bookings`'te değil `rides`'ta ayrı bir "ilan sahibi" kolonu gerektirir — bkz. aşağıdaki açık soru).

**Açık soru (Faz 2 detaylı planlamada netleştirilecek):** `rides` tablosunda şu an "ilan sahibi" = `driver_id`. Yolcu ilanında ilan sahibi bir yolcu ama `driver_id` boş olacağından, ilan sahibini tutacak ayrı bir kolon gerekiyor (ör. `posted_by uuid not null references profiles`, sürücü ilanında da `driver_id` ile aynı değeri taşır). Bu, `RideCard`, `/rides/mine`, `updateRide`/`cancelRide` yetkilendirmesi (`eq("driver_id", user.id)` → `eq("posted_by", user.id)`) dahil pek çok yeri etkileyen, ayrıca düşünülmesi gereken bir detay — implementasyon planı yazılırken netleştirilecek.

**UI/UX:**
- `RideForm.tsx`: en üstte rol seçimi ("Sürücüyüm" / "Yolcuyum"), role göre alan seti değişir (yolcu modunda vip/pets/smoking/plaka gizlenir).
- `RideCard.tsx`, `RideFilters.tsx`, `/rides` arama: yolcu ilanları aynı listede rozetle ("Yolcu arıyor" vs "Sürücü") ayırt edilir; filtre olarak "sadece sürücü ilanları / sadece yolcu ilanları / hepsi" eklenir.
- `/rides/mine`: sürücünün başkasının yolcu ilanına verdiği teklifler ayrı bir sekme/liste ister (şu an `/bookings` bunu kısmen karşılıyor olabilir, kontrol edilecek).
- `messages/{tr,en,ar}.json`: yeni namespace anahtarları (rol seçimi, "yolcu ilanı" etiketleri vb.), 3 dilde.

**Test etkisi:** `e2e/double-booking.spec.ts`, `e2e/booking-chat-review.spec.ts` şu an driver-only ilan varsayıyor — yeni bir `e2e/passenger-listing.spec.ts` eklenmesi gerekir (yolcu ilanı aç → sürücü teklif ver → yolcu onaylar → driver_id atanır → normal chat/pickup/review akışı aynen çalışır).

---

## Sıradaki Adım

Onaylandıysa: Faz 1 için `superpowers:using-git-worktrees` ile izole bir çalışma alanı açıp `superpowers:writing-plans` ile adım adım bir uygulama planı yazmaya geçebilirim (küçük, tek oturumda bitebilir). Faz 2 daha büyük — ayrı bir oturumda, "açık soru" (posted_by kolonu) netleştirildikten sonra ele alınması daha sağlıklı.
