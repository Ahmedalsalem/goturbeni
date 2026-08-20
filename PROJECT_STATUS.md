# Proje Durumu — GötürBeni

Bu belge, projenin faz bazlı tamamlanma durumunu ve production hazırlık denetiminin sonuçlarını kaydeder.

## Faz Durumu

| Faz | Durum | Kapsam |
|---|---|---|
| Faz 0 | ✅ Tamamlandı | Proje iskeleti, Feature-Based Architecture, i18n (TR/AR + RTL), dark mode, Supabase bağlantı altyapısı (misafir-güvenli) |
| Faz 1 | ✅ Tamamlandı | Supabase Auth (kayıt/giriş/çıkış), e-posta onay callback'i, `/profile` korumalı rota, `profiles` tablosu + RLS + otomatik profil trigger'ı, avatar upload |
| Faz 2 | ✅ Tamamlandı | `rides` tablosu + RLS, ilan oluşturma/düzenleme/iptal, ilan listesi (`/rides`, `/rides/mine`), durum rozetleri |
| Faz 3 | ✅ Tamamlandı | Arama/filtreleme (kalkış, varış, tarih, URL search params), sıralama (tarih/masraf payı), `/rides/[id]` ilan detay sayfası + SEO metadata |
| Faz 4 | ✅ Tamamlandı | `bookings` tablosu + RLS + `security definer` RPC'ler (`0003_bookings.sql`), rezervasyon talebi/onay/red/iptal akışı, `/bookings`, `/rides/[id]/bookings`, çifte-rezervasyon ve race-condition koruması |
| Faz 5 | ✅ Tamamlandı, canlı doğrulandı | `messages` tablosu + RLS + Realtime publication (`0004_messages.sql`), `/rides/[id]/chat` 1:1 sohbet (Supabase Realtime: mesaj + okundu bilgisi; Broadcast: yazıyor göstergesi) |
| Faz 6 | ✅ Tamamlandı, canlı doğrulandı | `reviews` tablosu + RLS (RPC yok) (`0005_reviews.sql`), tamamlanmış rezervasyon üzerinden karşılıklı 1-5 yıldız + yorum, profil/ilan detay sayfalarında puan gösterimi |
| Faz 7 | ✅ Tamamlandı, canlı doğrulandı | Production readiness: güvenlik (phone privacy + atomicity fix, `0007_profile_update_atomicity.sql`), deployment hardening (security headers), PWA (manifest + ikonlar + temel offline fallback), push notification altyapısı (soyutlama, o zaman gerçek servis yok), monitoring hazırlığı (logger + instrumentation hook + global-error), SEO, erişilebilirlik, performans (React `cache()` dedup) |
| Faz 8 | ✅ Tamamlandı | Otomatik tamamlanma (pg_cron, `0011`), AR il adları, telefon SMS/OTP doğrulaması (o zamanki hâli — sonradan Faz 14'te e-postaya taşındı), push notification'ın Web Push/VAPID'e bağlanması (`0012`) |
| Faz 9 | ✅ Tamamlandı | `npm audit` temizliği, mesaj/yorumların 15 dakikalık pencerede düzenlenebilir/soft-delete edilebilir olması (`0013`), self-referencing hreflang, PWA özel "yükle" düğmesi, Leaflet + OSM Nominatim ile harita/GPS konum seçimi |
| Faz 10 | ✅ Tamamlandı | Minimal admin paneli: `admin_flags` tablosu + RPC'ler (`0014_admin.sql`), `/admin` analytics, `/admin/users` (askıya alma), `/admin/rides` (ilan kaldırma) |
| Faz 11 | ✅ Tamamlandı | Rate limiting Upstash Redis'e taşındı, arama filtrelerine harita/GPS konum seçimi eklendi, otomatik E2E test suite (Playwright + CI) kuruldu |
| Faz 12 | ✅ Tamamlandı, CI'da 17/17 e2e + 114/114 unit test yeşil (commit `5afe509`) | `checkRateLimit` eksikliğinin giderilmesi, `deposit_deadline_at` cron'u (`0024`), kalan ödeme dekontu + red gerekçesi (`0025`), admin IBAN çapraz kontrolü, kural-tabanlı şüpheli hesap tespiti v1 — dört kural (`0026`), Resend e-posta bildirimi + karşı taraf e-postası RPC'si (`0027`), gerçek coğrafi "yakın il" araması |
| Faz 13 | ✅ Tamamlandı | Beşinci şüpheli hesap kuralı: yeni-hesap-yüksek-tutar (`0028`/`0029`); "kadın şoför" arama filtresi eklenmesi ve eski "yalnızca kadın yolcu" ilan filtresinin kaldırılması (`0030`/`0031`/`0033`); `/rides` ve okunmamış mesaj sayımı için performans indeksleri (`0032`) |
| Faz 14 | ✅ Tamamlandı | **Zorunlu hesap doğrulamasının SMS/OTP'den (Twilio) e-posta koduna (Resend) taşınması** (`0035`, kritik — bkz. aşağıda), telefon format senkron hatasının düzeltilmesi (`0034`), nav rozeti için `notification_events` (`0036`), onaylanmış rezervasyonlarda karşılıklı telefon numarası paylaşımı (`0037`) |
| Faz 15 | ✅ Tamamlandı | Sürücü canlı konum paylaşımı (`ride_live_locations`, Realtime, `0038`), tekrarlanan (haftalık) ilan serisi + otomatik oluşturma cron'u (`0039`), bekleme listesi (`0040`), no-show/geç iptal takibi + kural motoruna yeni sinyaller (`0041`/`0042`, toplam 7 kural), arama uyarıları (`0043`) |
| Faz 16 | ✅ Kod tamamlandı, **e2e artık var ve CI'da 53/53 yeşil** (Faz 17'de eklendi/doğrulandı), production'da (`0001`-`0066` uygulandı) | Formal anlaşmazlık (itiraz) çözüm sistemi + `/admin/disputes` (`0044`), dolandırıcılık tespiti v2 — üç yeni sinyal, toplam 10 kural (`0045`/`0046`), risk katmanlı toplu dekont onayı (`0047`), 4 haneli alım doğrulama kodu (`0048`) |
| Faz 17 | ✅ Tamamlandı, CI'da 53/53 e2e yeşil (commit `3562174`, run [32132849832](https://github.com/Ahmedalsalem/goturbeni/actions/runs/32132849832)), `0001`-`0066` production'da doğrulandı (bkz. aşağıda) | Araç plakası + DB format kontrolü (`0050`/`0051`), EN dil desteği (`0052`), arama uyarısı e-posta tip hatası düzeltmesi (`0049`), kapora+kalan ödeme dekontu OCR otomatik onayı (`0053`/`0054`), no-show sıkılaştırma + tek-ödeme modeline geçiş — %25/%75 depozito ayrımının kaldırılması (`0055`/`0056`/`0062`), yolcu ilanları/ters rezervasyon (`0057`-`0061`, `0063`), blablacar-gap özellikleri: nakit ödeme, anında onay, deneyim rozeti, klima filtresi, CO₂ tasarrufu (`0064`-`0066`); Faz 16'nın dört özelliği için eksik olan e2e testleri eklendi ve CI'da doğrulandı (`e2e/disputes.spec.ts`, `e2e/pickup-verification.spec.ts`, `e2e/bulk-receipt-approval.spec.ts`, `e2e/fraud-detection.spec.ts`); ayrıca nested worktree'nin `eslint`'i kirletmesi düzeltildi (`eslint.config.mjs`) |
| Faz 18 | ✅ Tamamlandı, CI yeşil, `0067` production'da uygulandı | Destek sayfasındaki "Bize Ulaş" butonu `mailto:` yerine Gmail compose ekranını yeni sekmede açıyor. **Her yeni ilanda tüm üyelere e-posta**: `get_all_member_emails_for_broadcast` RPC (`0067`) + `src/lib/new-ride-broadcast-email.ts`, `createRide` içinde `after()` ile arka planda tetikleniyor — mevcut arama-uyarısı bildirimlerinden (yalnızca o güzergaha alarm kuranlara) farklı olarak **filtre yok, tüm profillere gidiyor**; kullanıcının kendi açık isteğiydi, abonelikten çıkma seçeneği yok — bkz. Bilinen Sınırlamalar. |
| Faz 19 | ✅ Tamamlandı, CI yeşil (her commit ayrı ayrı doğrulandı, bkz. aşağıda) | Yayın e-postası artık sürücü/yolcu ilanına göre farklı metin kullanıyor (`newRideBroadcastBodyDriver`/`Passenger`, `2829b1b`). **Maliyet tahmini**: ilk kez ilan veren sürücü için kalkış/varış/koltuk sayısına göre kaba bir "Tahmini maliyet: ~X ₺" önerisi + tek tık doldurma butonu (`src/utils/cost-estimate.ts`, `606608a`), aynı-şehir seçiliyken "~0 ₺" göstermeme düzeltmesi (`8f5264e`) dahil; gerçek uygulama üzerinde iPhone/Android genişliklerinde görsel olarak da doğrulandı (bkz. aşağıda). `README.md` baştan sona güncellendi (`1db6963`) — en önemlisi, artık var olmayan bir ödeme modelini (%25 kapora/%75 kalan) anlatan bölümler düzeltildi. |

## Faz 19 (bu oturum) — Maliyet Tahmini, Mobil Görsel Doğrulama, README'nin Baştan Sona Güncellenmesi

Kullanıcının "sürücü ilk ilanını verirken ne kadar masraf payı isteyeceğini bilmiyor" gözlemi üzerine başladı, oradan bir dizi gerçek boşluk/hata bulma-düzeltme turuna dönüştü.

1. **Maliyet tahmini özelliği**: `src/utils/cost-estimate.ts`, iki il arası kuş uçuşu mesafeye (`turkish-provinces-geo.ts`, CO₂ tahmininin kullandığı aynı kaynak) ve sabit bir ₺3,5/km varsayımına dayanarak, `(koltuk sayısı + 1)`'e bölünmüş kaba bir kişi başı tahmin üretir; 5₺'ye yuvarlanır. `RideForm.tsx`'te "Masraf Payı" alanının altında bir ipucu + "Bu tutarı kullan" butonu olarak gösterilir — hiçbir zaman otomatik doldurmaz. Kullanıcı doğruluğunu sorguladı: gerçekten de iki bilinen sınırlaması var (kuş uçuşu mesafe gerçek yol mesafesinden ~%25-30 düşük çıkıyor, ₺/km oranı geçiş ücretini hiç saymıyor) — ikisi de kullanıcıya açıkça söylendi, düzeltilmedi (bilinçli, basit tutma kararı).
2. **Gerçek bir hata bulundu ve düzeltildi**: aynı şehir hem kalkış hem varış olarak seçiliyken tahmin "~0 ₺" gösteriyordu (mesafe 0 olduğu için) — şema zaten bunu submit'te reddediyor ama kullanıcı düzeltene kadar ipucu yanlış bir sayı gösteriyordu. `departureCity !== arrivalCity` koşulu eklendi (`8f5264e`).
3. **Sürücü/yolcu ilanı ayrımı sorgulandı, eklendi**: yayın e-postası (Faz 18) hem sürücü hem yolcu ilanı için aynı genel metni kullanıyordu; `RideCard`'ın kendi "Sürücü İlanı"/"Yolcu İlanı" rozet terimleri yeniden kullanılarak iki ayrı gövde metnine bölündü (`2829b1b`).
4. **Gerçek uygulama üzerinde mobil görsel doğrulama**: kullanıcı "genel olarak test et, görsel bozukluk olmasın" dedi — statik bir CSS kopyası yeterli görülmedi. Yerel `next dev` production Supabase'e (`.env.local`) bağlı şekilde çalıştırıldı, Playwright ile iPhone 14 (390px) ve Pixel 7 (412px) emülasyonunda ana sayfa/ilanlar/nasıl-çalışır/destek/kayıt/giriş/profil/ilan-ver (sürücü+yolcu modu, maliyet ipucu dahil)/ilanlarım/rezervasyonlarım sayfaları gezildi. **Production'a hiçbir yazma etkisi olmadan**: tek bir throwaway hesap oluşturuldu, hiçbir ilan/rezervasyon gönderilmedi (yeni "her ilanda tüm üyelere mail" özelliğinin yanlışlıkla tetiklenmemesi için özellikle kaçınıldı), iş bitince hesap `auth.admin.deleteUser` ile silindi. Bir yanlış-alarm bulundu ve düzeltildi (`fullPage` ekran görüntüsünün `position:fixed` bir banner'ı olduğundan farklı yerde gösterip "Ara" butonunu kapatıyormuş gibi görünmesi — gerçek koordinatlarla ölçünce sorun olmadığı kanıtlandı). Gerçek bir görsel bozukluk bulunmadı.
5. **`README.md` baştan sona güncellendi** (`1db6963`) — Faz 1'den (migration `0056`) beri hiç dokunulmamıştı. Eklenenler: yolcu ilanları, blablacar-gap özellikleri, yayın e-postası, maliyet tahmini, Gmail destek linki (Özellikler + Migration Sırası, `0057`-`0067` için 11 yeni madde); düzeltilenler: e2e dosya listesi (4→14), migration aralığı (0001–0052→0001–0067), i18n anahtar sayısı (752→796), eski Vercel URL'i (`goturbeni-five.vercel.app` → gerçek domain). **En önemli bulgu**: "Ödeme takibi" ve "Dekont OCR" bölümleri hâlâ `0062`'de tamamen kaldırılmış %25 kapora/%75 kalan ödeme modelini anlatıyordu — kodda (`actions.ts`'te `submit_deposit_receipt*` fonksiyonlarının hiç kalmadığı) ve `0062`'nin migration gövdesinde (beklenen OCR tutarı artık `cost_share × seat_count`'un tamamı) doğrulanarak düzeltildi; bu modeli referans alan RLS/Storage/Bilinen Sınırlamalar bölümleri de güncellendi.
6. **Her commit ayrı ayrı CI'da doğrulandı**: `2829b1b` (run [32254568656](https://github.com/Ahmedalsalem/goturbeni/actions/runs/32254568656)), `606608a` (run [32256243730](https://github.com/Ahmedalsalem/goturbeni/actions/runs/32256243730)), `8f5264e` (ilk koşu GitHub Actions'ın kendi Ubuntu paket aynası sorunuyla 6 saat asılı kalıp iptal oldu — kodla ilgisizdi, `gh run rerun --failed` ile tekrar çalıştırılıp yeşil alındı, run [32295764065](https://github.com/Ahmedalsalem/goturbeni/actions/runs/32295764065)), `1db6963` (run [32372652308](https://github.com/Ahmedalsalem/goturbeni/actions/runs/32372652308)).

## Faz 17 (bu oturum) — Belge Boşluğunun Kapatılması, Faz 16 için e2e, Production Durumu Denetimi

Bu oturumun tetikleyicisi: bu belge (`PROJECT_STATUS.md`) Faz 16'dan sonra hiç güncellenmemişti — `0049`'dan `0066`'ya kadar 18 migration'ı kapsayan üç ayrı iş kalemi (araç plakası, dekont OCR otomatik onayı + no-show sıkılaştırma, yolcu ilanları/ters rezervasyon, blablacar-gap özellikleri) burada da `CHANGELOG.md`'de de hiç kayıtlı değildi. Bu oturumda üç şey yapıldı:

1. **Belge boşluğu kapatıldı**: yukarıdaki Faz 17 satırı ve bu bölüm, `0049`-`0066` aralığındaki gerçek migration içeriği okunarak (varsayımla değil) yeniden inşa edildi — ayrıntı için ilgili migration dosyalarının kendi açılış yorumlarına bakın. `CHANGELOG.md`'ye de aynı kapsamda bir `[Unreleased]` girişi eklendi.
2. **Faz 16'nın eksik e2e testleri eklendi**: `0044`-`0048`'in dört özelliği (anlaşmazlık çözümü, dolandırıcılık tespiti v2, toplu dekont onayı, alım doğrulama kodu) o oturumda yalnızca unit test seviyesinde kalmıştı. Dört yeni spec eklendi:
   - `e2e/disputes.spec.ts` — `open_dispute`/`admin_set_dispute_status`: yolcu bir anlaşmazlık açar, buton devre dışı bir rozete döner, admin `open → in_review → resolved` akışını bir sonuç notuyla tamamlar.
   - `e2e/pickup-verification.spec.ts` — `verify_pickup_code`: onay anında üretilen kod servis-rolü istemcisiyle okunuyor (tabloda RLS select politikası kasıtlı olarak yok), sürücü önce yanlış kodu dener (red), sonra doğru kodu girer (her iki tarafta da doğrulandı rozeti).
   - `e2e/bulk-receipt-approval.spec.ts` — `admin_bulk_approve_receipts`: hesabı 15 gün geriye alınmış (≥14 gün eşiği) bir yolcunun OCR'a hiç eşleşmeyen (boş) bir dekontu bekleyen kalıyor, admin'de "Düşük Risk" rozetiyle işaretleniyor, toplu onay butonuyla tek tıkla onaylanıyor.
   - `e2e/fraud-detection.spec.ts` — dolandırıcılık v2'nin üç yeni sinyalinden en basit kurulabileni (`duplicate_iban`): iki hesap aynı (bu çalışmaya özgü, rastgele üretilmiş) IBAN'ı kaydediyor, admin `/admin/users`'ta ikisinin de işaretlendiğini görüyor. Diğer iki yeni sinyal (`disputed_repeatedly`, `repeated_receipt_rejection`) çok adımlı geçmiş kurulumu gerektirdiğinden bu oturumda ayrı bir spec'e konu olmadı — dolaylı olarak `disputes.spec.ts`/`payment-review.spec.ts`'in ürettiği veri bu kuralları da tetikleyebilir ama doğrudan bir assertion yok, gelecekte ayrı bir spec olarak eklenebilir.

   Statik doğrulamadan sonra `master`'a push edilip **CI'da gerçek Docker + yerel Supabase'e karşı 3 kez çalıştırıldı** — ilk koşuda 7 gerçek hata bulundu, ikincisinde 2, üçüncüsünde 0. Bulunan hataların hepsi test tarafındaydı, uygulama kodunda değil: (1) `/admin/users`, `/admin/payments`, `/admin/disputes` paylaşılan sayfalarını sayfa-geneli `getByText` ile denetlemek, paralel çalışan spec'lerin (ve retry'ların) aynı sabit IBAN/isim/varsayılan sebep metnini paylaşması yüzünden Playwright'ın strict-mode "resolved to N elements" hatasına yol açıyordu — bu, önceden geçen `payment-review.spec.ts`'i bile bozmuştu; düzeltme, her etkileşimi `[data-slot="card"]` + `uniqueSuffix()`'li benzersiz bir işaretle taranan bir karta sınırlamaktı (`e2e/utils.ts`'e `uniqueSuffix()`/`uniqueIban()` eklendi). (2) `pickup-verification.spec.ts`, "Bodrum"u il sanmıştı (aslında Muğla'nın ilçesi) — hiç eşleşmeyen bir seçenek 180sn'lik test timeout'una yol açıyordu. (3) `disputes.spec.ts`, aynı toast metnini iki farklı aksiyon için art arda beklediğinden, ikinci aksiyon (anlaşmazlığı çözme) gerçekten bitmeden sayfayı yeniliyordu — DOM tabanlı bir bekleyişe çevrildi. Üçüncü koşuda **53/53 e2e testi yeşil, 8.8 dakika** (commit `3562174`, run [32132849832](https://github.com/Ahmedalsalem/goturbeni/actions/runs/32132849832)) — ilk koşu 26 dakika sürmüştü, çakışma kaynaklı gereksiz retry'lar giderilince süre üçte bire indi.
3. **Production migration durumu araştırıldı ve düzeltildi**: CLI önce `401 Unauthorized` veriyordu (login değildi) ve Docker kapalıydı; kullanıcının bu oturumda paylaştığı bir Supabase erişim token'ıyla (`SUPABASE_ACCESS_TOKEN`) CLI yetkilendirildi. `npx supabase migration list`, production projesinin (`mfptzzrvekpvibxrifjt`) `0001`-`0063`'ü zaten uyguladığını ama **`0064`/`0065`/`0066`'yı (blablacar-gap-features: `payment_method`, `instant_booking`, `has_ac`) hiç almadığını** gösterdi — yani bu üç migration'a dayanan kod (nakit ödeme/anında onay/klima filtresi) Vercel'de deploy olsa bile DB tarafı eksikti. Kullanıcının onayıyla `npx supabase db push` çalıştırıldı, üçü de hatasız uygulandı; `migration list` tekrar çalıştırılıp `local` = `remote` (`0001`-`0066`, hepsi eşleşiyor) doğrulandı. `.github/workflows/ci.yml`'de migration'ları otomatik production'a uygulayan bir adım yok (kontrol edildi) — bu hâlâ elle `supabase db push` gerektiren, otomatikleşmemiş bir adım; bir sonraki iş kalemi tamamlandığında aynı manuel adım tekrar gerekecek.

## Faz 16 (bu oturum) — Anlaşmazlık Çözümü, Dolandırıcılık Tespiti v2, Toplu Dekont Onayı, Alım Doğrulama Kodu

Kapsam: dört bağımsız özelliğin migration + Server Action + UI + unit test seviyesinde tamamlanması.

- **`0044_disputes.sql`**: `disputes` tablosu (`dispute_reason`/`dispute_status` enum'ları), `open_dispute` (rezervasyonun yolcusu ya da sürücüsü karşı taraf hakkında bir anlaşmazlık açar, `against_user_id` çağıranın rolüne göre otomatik belirlenir) ve `admin_set_dispute_status` (open → in_review → resolved/dismissed + çözüm notu) RPC'leri. `bookings.one_active_per_passenger_ride` ile aynı partial-unique-index desenine sahip bir spam koruması: aynı rezervasyon için aynı anda birden fazla açık anlaşmazlık açılamaz. Yeni `/admin/disputes` sayfası (açık/çözülmüş kuyruk, `AdminDisputeResolveActions`).
- **`0045_fraud_v2_columns_and_enum.sql` + `0046_suspicious_accounts_fraud_v2.sql`**: `admin_get_suspicious_accounts`'a üç yeni kural eklendi (v1'in 7 kuralına ek): `duplicate_iban` (aynı IBAN birden fazla hesapta kayıtlı — hesap-çiftlik sinyali), `disputed_repeatedly` (bir kullanıcı, yön farketmeksizin 2+ anlaşmazlıkta şikayet edilen taraf olmuş), `repeated_receipt_rejection` (yolcu tarafında deposit+settlement, sürücü tarafında iade kanıtı için ömür boyu red sayaçları, `bookings.*_reject_count`, 3+ eşiği). Hâlâ ML değil — README'nin kendi ifadesiyle "kesin kanıt değil, işaret".
- **`0047_bulk_receipt_review.sql`**: `admin_bulk_approve_receipts(p_booking_ids, p_kind)` — `src/features/admin/risk.ts`'teki kural-tabanlı güven seviyesi (hesap yaşı ≥14 gün, şüpheli hesap değil, geçmiş red yok, açık anlaşmazlık yok) ile "düşük riskli" işaretlenen bekleyen dekontları admin'in tek tıkla toplu onaylamasına izin verir. `/admin/payments`'a risk rozetleri (`RiskBadge`) ve `BulkApproveReceiptsButton` eklendi. OCR/tutar doğrulaması yapmaz — yalnızca tıklamayı azaltır, her satır yine `*_reviewed_at` ile damgalanır.
- **`0048_pickup_verification_code.sql`**: rezervasyon onaylandığında (`approve_booking`'in genişletilmiş hâli) 4 haneli rastgele bir kod üretilir (`booking_pickup_codes`, kasıtlı olarak **hiçbir RLS select politikası yok** — bkz. README → RLS Yapısı). Yolcu kodu `/bookings`'te görür (`get_my_pickup_code`), sürücü `/rides/[id]/bookings`'te girer (`verify_pickup_code`, `for update` ile eşzamanlı deneme serileştirilir, uygulama katmanında ayrıca rate-limit'li).

**Test kapsamı**: her dört özellik için unit testler eklendi (`src/features/pickup/actions.test.ts`, `src/features/disputes/actions.test.ts`, `src/features/admin/risk.test.ts`). **Bu dört özellik için henüz bir e2e (Playwright) testi yok** — `e2e/` dizini hâlâ yalnızca `booking-chat-review.spec.ts`, `double-booking.spec.ts` ve `payment-review.spec.ts`'ten oluşuyor; disputes/pickup/bulk-approve/fraud-v2 akışları yalnızca unit test seviyesinde doğrulanmış durumda.

**Bu oturumda YAPILMAYAN**:

- `0044`–`0048` migration'ları henüz `supabase db push` ile production (linked) Supabase projesine uygulanmadı — bu beş migration şu an yalnızca dosya olarak repoda var, canlı veritabanı şeması hâlâ `0043`'te.
- Yeni dört özellik için e2e testi (yukarıya bakın).
- Gerçek hesaplarla uçtan uca canlı doğrulama (migration'lar push edilmediği için mümkün değil).

Doğrulama (bu oturumda, yerel): `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm test` — dördü de temiz/başarılı çalıştırıldı (bu dört özellik dahil). CI'da veya production Supabase'e karşı bir koşu **yapılmadı**.

## Faz 13 – Faz 15 (önceki oturumlar, bu belgeye bu oturumda eklendi)

Bu belge, Faz 12'den sonra migration `0028`–`0043` aralığında yapılan işi hiç kaydetmiyordu — bu üç faz, o migration'ların açılış yorumlarından ve CHANGELOG'da bir karşılığı olmadığından doğrudan koddan yeniden inşa edildi (bkz. README → Migration Sırası, madde 16-28 için tam ayrıntı). Özet:

- **Faz 13** — dolandırıcılık tespitine beşinci kural (yeni-hesap-yüksek-tutar), kadın şoför arama filtresi (ve eski "yalnızca kadın yolcu" ilan filtresinin kaldırılması), arama/mesaj performans indeksleri.
- **Faz 14** — **kritik**: zorunlu hesap doğrulamasının SMS/OTP'den (Twilio) e-posta koduna (Resend) taşınması. Gerekçe (`0035_email_based_verification.sql`'in kendi yorumundan): Twilio'nun ücretsiz deneme hesabı yalnızca önceden doğrulanmış numaralara SMS gönderebiliyordu, gerçek SMS gönderiminin ise hiçbir sağlayıcıda gerçekten ücretsiz bir yolu yok (operatör maliyeti). Telefon numarası hâlâ toplanıp saklanıyor (iletişim/güven bilgisi) ama artık doğrulama yükü taşımıyor; doğrulama durumu hâlâ `profiles_private.phone_verified` sütununda tutuluyor (isim değişmedi, anlamı değişti). Ayrıca telefon format senkron hatası düzeltmesi, nav rozeti altyapısı, karşılıklı telefon paylaşımı.
- **Faz 15** — sürücü canlı konum paylaşımı, tekrarlanan (haftalık) ilan serisi, bekleme listesi, no-show/geç iptal takibi (+ kural motoruna yeni sinyaller, toplam 7 kural), arama uyarıları.

Bu üç faz için ayrı bir canlı doğrulama kaydı yoktur (önceki oturumların kendi doğrulama notları bu belgeye hiç girmemiş) — migration'ların `0001`–`0043` aralığının production'a uygulanmış olduğu, `0044`'ten itibaren durmuş olan migration ledger'ının kendisinden çıkarılıyor (bkz. Faz 16'daki not).

## Faz 12 (önceki oturum)

Kapsam: kullanıcının, bir önceki oturumun kendi bulguları olarak bildirdiği 10 maddelik liste (bkz. CHANGELOG.md → Faz 12 için tam liste). Özet:

- Rate limiting, deposit-deadline cron, kalan ödeme dekontu + admin inceleme, red gerekçesi (deposit/settlement/iade), admin IBAN çapraz kontrolü, kural-tabanlı şüpheli hesap tespiti (v1), Resend e-posta bildirimi, gerçek coğrafi "yakın il" araması — hepsi kod seviyesinde tamamlandı, ayrıntı CHANGELOG.md'de.
- Yeni `e2e/payment-review.spec.ts`: dekont red/gerekçe/onay, admin IBAN gösterimi, kalan ödeme dekontu, coğrafi yakın-il fallback'ini uçtan uca kapsıyor.

**CI'da gerçek koşularla bulunup düzeltilen regresyonlar/hatalar** (8 ayrı koşu + düzeltme turu):

1. `package-lock.json`, yerel npm (11.17.0) ile üretildiği için CI'ın npm'iyle (10.9.8) `npm ci` senkron değildi.
2. E2E job'ı Docker Hub/ECR Public rate limitine takıldı → `docker/login-action` eklendi.
3. `signUp()` test helper'ı zorunlu `termsAccepted` onay kutusunu hiç işaretlemiyordu — sonsuza dek `/register`'da asılı kalıyordu.
4. Base UI Checkbox'ların gizli native `<input>`'una tıklamak "intercepts pointer events" veriyordu — `aria-labelledby` ile gerçek tıklanabilir elemana geçildi.
5. `createRide()` sürücü profilinde IBAN olmasını gerektiren bir kontrole hiç takılmıyordu.
6. `findAuthUserByEmail` e-postaları case-sensitive karşılaştırıyordu.
7. **Kritik production hatası**: `src/app/bookings/page.tsx`, bir closure'ı doğrudan bir Client Component'e prop olarak geçiriyordu — kalan ödemesi bekleyen her kullanıcı için `/bookings` production'da çöküyordu. `SettlementReceiptUpload.tsx` client sarmalayıcısıyla düzeltildi.
8. 3 spec dosyasının toplam 8 sign-up'ı aynı process-memory `SIGNUP_RATE_LIMIT` bucket'ını paylaşıyordu.
9. `signIn()` artık `/profile` değil `/rides`'a yönlendiriyor.
10. Playwright test timeout'u 30s → 180s'e çıkarıldı.

**Sonradan tamamlanan**: `0024`–`0027` migration'ları `supabase db push` ile production projesine (`dvpxvcvmtxsticczlpwg`) uygulandı ve doğrulandı.

Doğrulama: `npm run lint`, `npx tsc --noEmit`, `npm run build` (34 rota), `npm test` (114/114), i18n anahtar eşleşmesi (594/594), **CI'da 17/17 e2e + 114/114 unit test yeşil** (commit `5afe509`, run [30211638989](https://github.com/Ahmedalsalem/goturbeni/actions/runs/30211638989)).

## Faz 11 (önceki oturum)

Kapsam: (1) rate limiting'in çoklu-instance sorunu, (2) otomatik E2E test eksikliği, (3) belge güncelliği, (4) arama filtrelerinde harita/GPS konum seçimi eksikliği.

- **Rate limiting → Upstash Redis**: `src/lib/rate-limit.ts`, `@upstash/ratelimit` + `@upstash/redis` kullanacak şekilde yeniden yazıldı. Env değişkenleri eksikse production'da ilk kullanımda hata fırlatır (fail-fast); yerelde process-memory limiter'a düşer.
- **Arama filtrelerinde harita/GPS konum seçimi**: `RideFilters.tsx`'e mevcut `LocationPicker` bileşeni eklendi.
- **Otomatik E2E testleri**: `playwright.config.ts`, `e2e/utils.ts`, `e2e/booking-chat-review.spec.ts`, `e2e/double-booking.spec.ts` eklendi; CI'da paralel bir `e2e-tests` job'ı kuruldu. İlk koşuda 5 gerçek hata bulunup düzeltildi (lockfile drift, timeout, eksik GRANT'lar, Node sürümü, test-yazım hatası).

Doğrulama: `npm run lint`, `npx tsc --noEmit`, `npm test` (110/110), `npm run build`, CI'da **9/9 E2E + 110/110 unit test yeşil** (commit `a425ccc`, run [30154844199](https://github.com/Ahmedalsalem/goturbeni/actions/runs/30154844199)).

## Faz 8 — Faz 7 Bilinen Sınırlamaları (önceki oturum)

- **Otomatik tamamlanma**: `0011_ride_auto_complete.sql`, pg_cron ile her dakika `departure_time`'ı geçmiş ilanları `completed`'e çevirir.
- **AR il adları**: `src/utils/turkish-provinces-ar.ts`, 81 il için doğrulanmış Arapça görünen adlar.
- **SMS/OTP telefon doğrulama (o zamanki hâli)**: `0010_phone_verification.sql`, Supabase Auth'un `phone_change` OTP akışını kullanıyordu. **Bu akış Faz 14'te tamamen terk edildi** (bkz. yukarıda) — bu satır yalnızca tarihsel kayıt amaçlıdır.
- **Push notification**: `0012_push_subscriptions.sql` + `src/lib/notifications.ts` (web-push, VAPID).

Doğrulama: `npm run lint`, `npx tsc --noEmit`, `npm test` (91/91), `npm run build` (28 rota), i18n (377/377).

## Faz 7 — Production Readiness (önceki oturum)

Kapsam: yeni özellik yok, yalnızca production'a hazırlık. Ayrıntılı liste için [CHANGELOG.md](./CHANGELOG.md).

- **Güvenlik**: `profiles` tablosundaki genel SELECT politikasının anon dahil herkesin telefon numarasını okumasına izin verdiği bulundu; `profiles_private`'a taşıma (`0006`) ve tek transaction'lı `update_own_profile` RPC'si (`0007`) ile düzeltildi.
- **PWA, push notification altyapısı, monitoring hazırlığı, SEO, erişilebilirlik, performans**: bkz. CHANGELOG.

Doğrulama: `npm run lint`, `npx tsc --noEmit`, `npm run build` (28 rota), `npm test` (71/71).

### Canlı doğrulama (Faz 7 oturumu)

`0007_profile_update_atomicity.sql` production projesine (`dvpxvcvmtxsticczlpwg`) uygulandı. İki gerçek hesapla (1 sürücü + 1 yolcu) uçtan uca doğrulanan akış: kayıt, profil güncelleme (telefon dahil), avatar yükleme, ilan oluşturma, arama/filtreleme, rezervasyon talebi/onayı, karşılıklı mesajlaşma (Realtime), kalkış sonrası karşılıklı değerlendirme, şifre sıfırlama ("bağlantı gönderildi" adımı), giriş/çıkış. Test verileri temizlendi (0 kalıntı doğrulandı).

## Faz 5 + Faz 6 — Mevcut Durum (önceki oturum)

`npm run lint`/`npx tsc --noEmit`/`npm run build` temiz. Sürücünün "yorum yaptınız mı" kontrolü ilk yazımda yolcu bazında hesaplanmıştı; `reviews` unique index'i ilan bazında olduğundan (`(ride_id, reviewer_id)`) ilan bazına düzeltildi (bulgu sonradan `0008`'de kalıcı olarak çözüldü).

## Faz 3 + Faz 4 Gerçek Supabase Doğrulaması (önceki oturum)

`0003_bookings.sql` production projesine uygulandı. Üç gerçek test hesabıyla (1 sürücü + 2 yolcu) uçtan uca doğrulanan akış: ilan oluşturma, arama, rezervasyon talebi/onay/red/iptal, çifte-rezervasyon koruması, partial unique index'in `rejected` sonrası yeniden talebe izin verdiğinin doğrulanması, AR/RTL görsel doğrulama. Bulunup düzeltilen gerçek hata: `/rides` sıralama alanının seçili değeri ham teknik değer olarak göstermesi (`SelectValue` render-prop'u eksikti).

## Gerçek Supabase Doğrulaması (genel kayıt)

Faz 2 kapsamında gerçek bir Supabase projesine karşı uçtan uca doğrulama yapıldı: kayıt/giriş/çıkış, avatar upload, profil/ilan CRUD, RLS politikaları, foreign key cascade. Production hazırlık denetimi sırasında ayrıca doğrulanan: `.env.local` gerçek proje kimlik bilgileriyle dolu, herkese açık/korumalı rotaların beklenen HTTP kodlarını döndürdüğü, canlı veritabanına salt-okunur sorgu.

## Bu Oturumda Yapılan Denetim ve Sonuçları (production hazırlık oturumu, genel kayıt)

| Kontrol | Sonuç |
|---|---|
| `npm run lint` (ESLint) | ✅ Temiz |
| `npx tsc --noEmit` | ✅ Temiz |
| `npm run build` | ✅ Başarılı |
| `console.log`/`TODO`/`FIXME`/`any` taraması | ✅ `src/` içinde yok |
| `service_role` kullanımı | ✅ Kod tabanında hiçbir yerde yok |
| i18n anahtar eşleşmesi (tr/ar) | ✅ Birebir eşleşiyor (bkz. her fazın kendi doğrulama notu için güncel sayı) |
| `npm audit` | ⚠️ Next.js'in kendi bundle'ındaki transitive `postcss`/`sharp` CVE'leri — tek çözüm `next@9.3.3`'e düşmek, kabul edilemez, bilinçli olarak dokunulmadı (bkz. CHANGELOG). `eslint@10`'a geçiş de `eslint-config-next`'in Next 16 gerektirmesi yüzünden mümkün değil. |
| `.env.local` git'e commit edilmiş mi | ✅ Hayır |

## Bilinen Sınırlamalar

Güncel ve tam liste için [README.md → Bilinen Sınırlamalar](./README.md#bilinen-sınırlamalar) bölümüne bakın — bu belge yalnızca faz geçmişini tutar, sınırlama listesi tek bir yerde (README) güncel tutulur, burada tekrar edilmez.
