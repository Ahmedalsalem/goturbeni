# GötürBeni

Türkiye'de şehirler arası masraf paylaşımı esaslı yolculuk platformu (BlaBlaCar benzeri). Kullanıcılar araç ilanı verip yolculuk masrafını paylaşabilir, ilan arayabilir ve kendi ilanlarını yönetebilir.

**Faz 0 – Faz 16 tamamlandı; `0001`–`0052` migration'larının tamamı gerçek (production) Supabase projesine uygulanmış ve canlıda çalışıyor durumda** (anlaşmazlık çözümü, dolandırıcılık tespiti v2, toplu dekont onayı, alım doğrulama kodu, plaka format doğrulaması, İngilizce dil desteği dahil). Uygulama Vercel'de yayında ve GitHub'a bağlı sürekli deploy ile çalışıyor. Ayrıntılı durum raporu için [PROJECT_STATUS.md](./PROJECT_STATUS.md), sürüm geçmişi için [CHANGELOG.md](./CHANGELOG.md) dosyalarına bakın.

## Proje Amacı

Şehirler arası araçla seyahat eden sürücülerin boş koltuklarını, masraf paylaşımı esasıyla (ticari taşımacılık değil) ilan edebildiği; yolcuların da bu ilanları arayıp rezervasyon talebi oluşturabildiği bir platform. İlan yayınlama, arama/filtreleme, koltuk rezervasyonu (talep → onay/red → iptal), 1:1 sohbet, karşılıklı değerlendirme, ödeme takibi, bekleme listesi, tekrarlanan (haftalık) ilanlar, canlı konum paylaşımı ve anlaşmazlık çözümü uçtan uca çalışır; uygulama production'da yayındadır.

## Özellikler

- **Kimlik doğrulama ve hesap onayı**: E-posta/şifre ile kayıt ve giriş (Supabase Auth). Zorunlu hesap doğrulaması, 6 haneli bir kodun Resend ile e-postaya gönderilip `verify_email_otp` RPC'siyle onaylanmasına dayanır (`0035_email_based_verification.sql`). **Telefon numarası doğrulama yükü taşımaz** — yalnızca iletişim/güven bilgisi olarak kayıt sırasında toplanıp saklanır; eskiden (Twilio Verify ile) SMS/OTP tabanlıydı, Twilio'nun ücretsiz deneme hesabı yalnızca önceden doğrulanmış numaralara SMS gönderebildiğinden ve gerçek SMS gönderiminin operatör maliyeti olduğundan bu model terk edildi (bkz. CHANGELOG). Doğrulama sonucu hâlâ `profiles_private.phone_verified` sütununda tutulur — isim tarihsel nedenlerle "telefon doğrulandı" gibi görünse de artık gerçekte "hesap e-posta koduyla doğrulandı" anlamına gelir.
- **Profil yönetimi**: Ad, telefon, biyografi, cinsiyet (kendi beyanına dayalı, kimlik doğrulamalı değil), araç marka/modeli/plakası düzenleme; Supabase Storage üzerinden avatar yükleme (kullanıcı başına izole klasör). Plaka, girildiğinde standart Türk plaka formatına göre doğrulanır (uygulama katmanında Zod, veritabanında `NOT VALID` bir check constraint, `0051_car_plate_format_check.sql`) ve bir ilan yayınlayabilmek için sürücü profilinde geçerli formatta bir plaka bulunması **zorunludur** (IBAN kontrolüyle aynı desende, `features/rides/actions.ts` → `createRide`).
- **İlan sistemi**: İlan oluşturma/düzenleme/iptal etme, 81 il + opsiyonel ilçe arasından kalkış/varış seçimi, tarih/saat/koltuk/masraf payı/açıklama alanları, evcil hayvan/sigara/klima tercihleri, VIP (tek yolcu) ilan seçeneği, ödeme yöntemi seçimi (banka havalesi/nakit, yalnızca sürücü ilanında — bkz. "Ödeme takibi"), anında onay seçeneği (bkz. "Rezervasyon sistemi"). İlk kez ilan veren, ne kadar masraf payı isteyeceğini bilmeyen bir sürücü için: kalkış/varış/koltuk sayısı girilince, iki il arası kuş uçuşu mesafeye (`turkish-provinces-geo.ts`) dayalı kaba bir tahmin ("Tahmini maliyet: ~X ₺") ve tek tıkla o tutarı doldurma butonu gösterilir (`src/utils/cost-estimate.ts`) — asla otomatik doldurmaz, yalnızca öneridir; ₺/km oranı sabit bir varsayımdır, canlı yakıt fiyatı çekmez.
- **Yolcu ilanı (ters rezervasyon)**: Bir yolcu da "yolculuk arıyorum" ilanı açabilir (`posted_by_role='passenger'`) — sürücü ilanının aynadaki hâli. İlan sahibi (`posted_by`) her zaman ilanı açan kişidir; `driver_id` yalnızca bir sürücü teklif verip o teklif onaylandığında atanır (onay öncesi `NULL`). Sürücüler bu tür ilanlara "teklif" verir (`booker_role='driver'`), ilan sahibi (yolcu) teklifi kabul eder — teklif veren sürücünün IBAN/plaka bilgisi onay öncesi kontrol edilir (`get_offer_driver_readiness`, `0063`). Normal sürücü-ilanı akışıyla aynı rezervasyon/ödeme/mesajlaşma/değerlendirme altyapısını paylaşır, yalnızca "kim kime teklif veriyor" rolü tersine döner.
- **Nakit ödeme seçeneği**: Sürücü ilan verirken ödeme yöntemini banka havalesi yerine nakit olarak işaretleyebilir (`payment_method`, `0064`) — yolcu ilanlarında henüz sürücü atanmadığından bu seçenek yalnızca sürücü ilanında gösterilir, yolcu ilanları hep `bank_transfer` varsayılanında kalır. Nakit seçilen yolculuklarda dekont yükleme/OCR akışı hiç kullanılmaz, yalnızca mevcut dekontsuz karşılıklı "Ödeme Tamamlandı" onayı geçerlidir.
- **Anında onay**: Sürücü bir ilanda "Anında Onay"ı açarsa, koltuk müsaitse yolcunun rezervasyon talebi `pending` durumuna hiç girmeden otomatik onaylanır (`instant_booking`, `create_booking` RPC, `0065`). Bu RPC aynı zamanda koltuk kontrolünü `for update` kilitleme ile atomik hale getirir — eskiden yalnızca uygulama katmanında yapılan bu kontrol artık aynı anda gelen iki talepte de güvenlidir (yalnızca normal sürücü ilanlarında; yolcu ilanı tekliflerinde IBAN/plaka hazırlık kontrolü zaten senkron olduğundan bu akışın dışındadır).
- **Deneyim seviyesi rozeti**: Bir sürücünün tamamlanmış yolculuk sayısına göre türetilen (Yeni Üye / Aktif Üye / Deneyimli / Elçi) bir rozet, ilan kartlarında ve rezervasyon yönetim sayfasında güven sinyallerinin yanında gösterilir (`src/features/reviews/experienceLevel.ts`) — yeni bir tablo/sorgu değil, zaten var olan tamamlanmış-yolculuk sayısının üzerine saf bir etiketleme katmanıdır.
- **CO₂ tasarrufu göstergesi**: İlan detay sayfası ve kartlarda, o yolculuğun paylaşılmasıyla (sürücü + koltuk sayısı kadar yolcu tek araçta) yaklaşık ne kadar CO₂ tasarrufu sağlandığı gösterilir (`src/utils/co2-savings.ts`) — kuş uçuşu mesafeye ve sabit bir ortalama emisyon varsayımına dayanan kaba bir tahmindir, kesin ölçüm değildir.
- **Tekrarlanan (haftalık) ilan**: Sürücü bir ilanı "her hafta tekrarla" olarak işaretleyebilir (`ride_series`); her gece çalışan bir cron, seri hâlâ aktifse ve sürücünün IBAN'ı kayıtlıysa bir sonraki haftanın ilanını otomatik açar (`0039_ride_series.sql`). Bir haftanın ilanını iptal etmek yalnızca o haftayı etkiler, seriyi durdurmak ayrı bir işlemdir.
- **Arama ve filtreleme**: `/` ve `/rides` üzerinde kalkış/varış/tarih filtresi + tarih/masraf payına göre artan/azalan sıralama, "kadın şoför" filtresi, harita/GPS konum seçimi; filtreler URL search params'a yazılır. Arama üç kademelidir: tam ilçe → aynı il → 150km içindeki coğrafi olarak yakın iller (haversine mesafesi, `0032`/geo-fallback). Aranan güzergahta ilan yoksa kullanıcı bir arama uyarısına (`ride_search_alerts`) kaydolabilir; o güzergahta yeni bir ilan açıldığında bir kez push/e-posta bildirimi alır (`0043_ride_search_alerts.sql`).
- **İlan detay sayfası**: `/rides/[id]` — sürücü bilgisi (ad, avatar, bio, araç), yolculuk detayları, SEO metadata; misafir de görüntüleyebilir.
- **Rezervasyon sistemi**: Yolcu bir ilana koltuk talebi oluşturur (`pending`), sürücü onaylar/reddeder; onayda `available_seats` atomik olarak düşer (race-condition-safe, bkz. RLS Yapısı), iptalde geri iade edilir. `/bookings` ("Benim Rezervasyonlarım") ve `/rides/[id]/bookings` (sürücü onay paneli). Dolu bir ilana talep oluşturamayan yolcu bir bekleme listesine katılabilir (`ride_waitlist`); koltuk açıldığında (bir onaylı rezervasyon iptal edildiğinde) listedeki herkese bildirim gider, ama otomatik rezervasyon oluşturulmaz — ilk talep eden kazanır (`0040_ride_waitlist.sql`).
- **Alım doğrulama kodu**: Rezervasyon onaylandığında 4 haneli rastgele bir kod üretilir, yalnızca yolcuya (`/bookings`) gösterilir; sürücü yolcudan bu kodu sözlü isteyip kendi ekranına (`/rides/[id]/bookings`) girer, doğruysa yolculuk "alındı" işaretlenir (`0048_pickup_verification_code.sql`). Kod, sürücünün kimliğini doğruladığından emin olmak için var — kodun kendisi hiçbir RLS select politikasıyla okunamaz, bkz. RLS Yapısı.
- **No-show / geç iptal takibi**: Kalkış saati geçmiş onaylanmış bir rezervasyonda karşı taraf gelmediyse bildirilebilir (`report_no_show`); kalkışa 2 saatten az kala yapılan iptaller ayrıca işaretlenir (`cancelled_at`) — her ikisi de aşağıdaki kural-tabanlı şüpheli hesap tespitine sinyal olarak akar (`0041`/`0042`).
- **Canlı konum paylaşımı**: Onaylanmış rezervasyonu olan yolcu, sürücünün "şu an nerede" konumunu görebilir (Realtime, tek satır/ilan — geçmiş kayıt tutulmaz); sürücü paylaşımı istediği an durdurabilir (`0038_ride_live_locations.sql`).
- **İlan keşfi**: Herkese açık `/rides` listesi (kart görünümü — kalkış, varış, tarih, saat, boş koltuk, masraf payı, durum, sürücü adı ve avatarı), `/rides/mine` altında sürücünün kendi ilan paneli.
- **Durum yönetimi**: İlan için Aktif / Dolu / Tamamlandı / İptal, rezervasyon için Beklemede / Onaylandı / Reddedildi / İptal Edildi rozetleri.
- **Mesajlaşma**: Sürücü ile onaylanmış rezervasyonu olan yolcu arasında 1:1 sohbet (`/rides/[id]/chat`), Supabase Realtime ile anlık mesaj/okundu bilgisi, ephemeral broadcast ile "yazıyor..." göstergesi, konum paylaşımı (ayrı bir mesaj tipi olarak). Onaylanmış bir rezervasyonda taraflar birbirinin telefon numarasını da görebilir (`get_ride_counterparty_phone`, `0037`). Bir ilanda birden fazla onaylanmış yolcu varsa sürücü hangi yolcuyla konuşacağını seçer.
- **Değerlendirme (review)**: Yolculuğun kalkış zamanı geçmiş, onaylanmış bir rezervasyon üzerinden sürücü ve yolcu birbirini 1-5 yıldız + opsiyonel yorumla değerlendirebilir (yolculuk başına bir kez). Profil sayfasında ortalama puan/toplam yorum/toplam yolculuk, ilan detay sayfasında sürücünün ortalama puanı ve son yorumları gösterilir.
- **Anlaşmazlık (itiraz) çözümü**: Rezervasyonun yolcusu ya da ilanın sürücüsü, karşı taraf hakkında formel bir anlaşmazlık açabilir (ödeme alınmadı, tutar uyuşmazlığı, hizmet tanımdan farklı, güvenlik endişesi, diğer). Admin `/admin/disputes`'ta açık/incelenen anlaşmazlıkları görüp durumunu ilerletir (open → in_review → resolved/dismissed), bir çözüm notu ekler (`0044_disputes.sql`).
- **Çok dilli ve RTL**: Türkçe / Arapça / İngilizce arayüz (`messages/tr.json`, `messages/ar.json`, `messages/en.json` — 796 anahtar birebir eşleşir), cookie tabanlı locale seçimi, Arapça için tam RTL desteği (yön ikonları dahil).
- **Tema**: Açık/koyu mod (next-themes).
- **Misafir modu**: Supabase kimlik bilgileri boşken bile herkese açık sayfalar (`/`, `/rides`, `/rides/[id]`) çalışır; korumalı sayfalar `/login`'e yönlendirir. Giriş yapmamış bir ziyaretçiye cihaz başına yalnızca ilk ziyarette (localStorage, auth sayfalarında hiç gösterilmez) bir karşılama modalı (`WelcomeAuthModal`) giriş/kayıt CTA'sı gösterir; mobil header'da da misafir için "Giriş Yap"/"Kayıt Ol" her genişlikte doğrudan görünür — ayrı bir hamburger menü ikonu yoktur (eskiden vardı, yalnızca 4 nav linkini ve bir "Kayıt Ol" yedeğini içeriyordu; kaldırıldı, "Nasıl Çalışır"/"Destek" linkleri Footer'a taşındı).
- **PWA**: `manifest.webmanifest`, uygulama ikonları, `theme-color`, temel düzeyde offline fallback (`public/sw.js` yalnızca `/offline` sayfasını önbelleğe alır). iOS'ta yükleme rehberi (`IOSInstallPrompt`) yalnızca gerçek Safari'de Paylaş→Ana Ekrana Ekle adımlarını gösterir; iOS'taki diğer tarayıcılarda (Chrome/Firefox/Edge/Opera — hepsi aynı WebKit UA'yı paylaşır ama yalnızca Safari'nin Paylaş sayfası gerçek bir PWA kurar) kullanıcıya sayfayı Safari'de açması söylenir.
- **Push notification + e-posta**: booking/chat/no-show/bekleme listesi/arama uyarısı olayları Web Push (VAPID, `src/lib/notifications.ts`) ile gerçek tarayıcı bildirimleri, aynı olaylar için Resend ile e-posta (`src/lib/email.ts`) gönderir. Ayrıca **her yeni ilanda `profiles` tablosundaki tüm üyelere** (arama uyarısı kurup kurmadığına bakılmaksızın, ilanı yayınlayan hariç) ayrı bir e-posta gider (`src/lib/new-ride-broadcast-email.ts`, `0067`) — arama uyarılarının aksine opt-in değildir, bkz. Bilinen Sınırlamalar. — kullanıcı siteyi açık tutmasa bile bildirimi kaçırmaz (ikisi de üçüncü parti hesap boşken no-op'a düşer). Tüm e-postalar ortak, markalı bir HTML şablonundan (`renderEmailHtml`) geçer — marka başlığı, selamlama, stilize CTA butonu, imza ve alt bilgi notu; Arapça için `dir="rtl"` dahil. Üst menüdeki "İlanlarım"/"Rezervasyonlarım" öğelerinde ve sohbet listelerinde, kalıcı bir `notification_events`/`messages.read_at` tablosundan türetilen küçük kırmızı rozetler de kullanıcıyı yeni bir şeyden haberdar eder — okunmamış bir sohbet mesajı, alıcının o ilandaki rolüne göre (sürücüyse "İlanlarım", yolcuysa "Rezervasyonlarım") doğru öğeyi işaretler (`getUnreadNavBadges`, `src/features/notifications/queries.ts`).
- **Ödeme takibi**: komisyonsuz, doğrudan-şahıslar-arası IBAN ödemesi — **tek seferde, yolculuk sonunda, ücretin tamamı** (`0062_single_payment_at_settlement.sql`). Eskiden (`0056`'ya kadar) rezervasyon onayında masraf payının %25'i kapora olarak, kalkıştan sonra kalan %75'i settlement olarak ayrı ayrı ödeniyordu — bu iki aşamalı akış tamamen kaldırıldı; `approve_booking` artık ödemeyle hiç ilgili değildir, salt bir rezervasyon/teklif kabulüdür. Yolculuk sonrası dekont yükleme + admin inceleme (onay/red + gerekçe) ve dekontsuz karşılıklı "Ödeme Tamamlandı" onayı (`confirm_remaining_payment`) hâlâ geçerlidir, ilan iptalinde iade takibi de aynen sürer. Admin, dekont incelerken sürücünün kayıtlı IBAN'ını dekonttaki adla göz kontrolü için görür. Bekleyen dekontlar hesap yaşı/şüpheli hesap/geçmiş red/açık anlaşmazlık sinyallerine göre "düşük riskli"/"yüksek riskli" olarak etiketlenir; düşük riskli olanlar admin tarafından tek tıkla toplu onaylanabilir (`admin_bulk_approve_receipts`, `0047_bulk_receipt_review.sql`, `0062`'de tek-ödeme modeline göre tek parametreli hâline indirgendi) — bu otomasyon yalnızca tıklamayı azaltır, her satır yine `*_reviewed_at` ile damgalanır. Sürücü ilanında ayrıca **nakit** ödeme yöntemi seçilebilir (bkz. yukarıda) — bu durumda dekont/OCR akışı hiç devreye girmez.
- **Dekont OCR ile otomatik onay**: yolcu yolculuk sonrası dekontu yüklediğinde, sunucu tarafında Tesseract (`tesseract.js`, ücretsiz/açık kaynak — `src/lib/ocr.ts`) dekonttan IBAN ve tutar adaylarını okur; bunlar `submit_settlement_receipt_ocr` (`0054_settlement_ocr_auto_approval.sql`, beklenen tutar `0062`'den beri masraf payı × koltuk'un **tamamı**, ±5₺ tolerans) RPC'sinde sürücünün gerçek kayıtlı IBAN'ı ve ödemenin gerçek tutarıyla **veritabanı içinde yeniden karşılaştırılır** — istemciden/server action'dan gelen bir "eşleşti" bayrağına asla güvenilmez. Eşleşme, hesap ≥14 gün yaşında/askıya alınmamış/geçmiş red yok/şüpheli hesap değil/açık anlaşmazlığı yok (aynı risk kriterleri, `0047`) koşuluyla birleşince **her iki tarafın da** karşılıklı "Ödeme Tamamlandı" onayı otomatik verilir (yolcunun doğru IBAN'a doğru tutarı gösteren bir dekont yüklemesi zaten kendi "gönderdim" beyanının kanıtıdır). Eskiden ayrıca bir kapora dekontu OCR akışı da vardı (`submit_deposit_receipt_ocr`, `0053`) — tek-ödeme modeline geçişte (`0062`) deposit'e dair tüm fonksiyonlarla birlikte tamamen kaldırıldı. OCR görüntü-metin okumasıdır, gerçek banka doğrulaması değildir — doğru IBAN/tutarı bir görsele yazmak mümkün olduğundan bu sıfır-doğrulamalı self-approve'a göre daha güçlü bir sinyal, ama kesin kanıt değildir (bkz. Bilinen Sınırlamalar). Tesseract'ın İngilizce dil verisi (`assets/tesseract-lang/eng.traineddata`, ~5MB) projeye gömülüdür ve `next.config.ts`'teki `outputFileTracingIncludes` ile ilgili route'ların serverless fonksiyonuna dahil edilir — varsayılan davranışta (jsdelivr CDN'den her soğuk başlangıçta indirme) yerine, hiç ağ isteği olmadan diskten okunur.
- **Rate limiting**: kayıt, giriş, şifre sıfırlama, ilan/rezervasyon/mesaj/dekont yükleme, anlaşmazlık açma, alım kodu doğrulama işlemleri IP/kullanıcı bazlı, Upstash Redis'te (çoklu-instance production'da paylaşılan durum) tutulan bir sabit-pencere limitleyiciyle (`src/lib/rate-limit.ts`) korunur.
- **Admin paneli**: `/admin` analytics (kullanıcı/ilan/rezervasyon sayıları, trend grafiği), `/admin/users` (kullanıcı askıya alma + kural-tabanlı şüpheli hesap işaretleme, v1→v2, toplam 10 kural), `/admin/rides` (ilan kaldırma), `/admin/payments` (dekont/iade inceleme, risk etiketli toplu onay), `/admin/disputes` (açık/çözülmüş anlaşmazlık kuyruğu).
- **Production hardening**: güvenlik başlıkları (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, vb.), merkezi hata loglama (`src/lib/logger.ts`), Sentry hata izleme (`@sentry/nextjs`, `src/sentry.*.config.ts`), Google Analytics (Consent Mode v2), `metadataBase`/OpenGraph/canonical URL'lerle SEO.
- **Bilgilendirme sayfaları**: `/how-it-works`, gerçek uçtan uca akışı (ara/filtrele → ücretsiz rezervasyon talebi → sürücüyle iletişim + alım kodu → tamamla, yolculuk sonrası öde + değerlendir) dört adımda anlatır; `/support`, kategorilere ayrılmış (Rezervasyon & Ödeme / Güvenlik & Doğrulama / Hesap & Sürücü) SSS ile bir e-posta iletişim kartı içerir — "Bize Ulaş" butonu `mailto:` yerine doğrudan Gmail'in compose ekranını yeni sekmede açar (`novarodigitalstudio@gmail.com`), çoğu kullanıcının mail'i tarayıcıda okuduğu için.

## Teknoloji Stack

- **Next.js 15** (App Router, TypeScript strict, `src/` dizini, Turbopack)
- **TailwindCSS v4** + **shadcn/ui** (`base-nova` stili, RTL destekli, `@base-ui/react` primitifleri)
- **Supabase**: Auth, Postgres Database, Storage — `@supabase/ssr` ile
- **next-intl**: Türkçe / Arapça / İngilizce, cookie tabanlı locale, Arapça için tam RTL desteği
- **Doğrulama**: Server Actions + Zod (auth/profil/pickup/dispute formları); **react-hook-form + Zod** (ilan formu)
- **Leaflet + react-leaflet**: harita/GPS konum seçimi (ilan formu ve arama filtreleri)
- **web-push**, **resend**: push notification ve e-posta bildirimi
- **@upstash/ratelimit**, **@upstash/redis**: production rate limiting
- **@sentry/nextjs**: hata izleme
- **ESLint + Prettier**, **Vitest** (unit test), **Playwright** (e2e test)

## Mimari

- **Feature-based mimari**: `src/features/<domain>/` altında her domain kendi `schemas.ts` (Zod), `actions.ts` (Server Actions), `queries.ts` (okuma) ve bileşenlerini barındırır. `src/app/` yalnızca routing + sayfa kompozisyonu içerir, iş mantığı içermez.
- **Supabase erişim katmanı** (`src/lib/supabase/`):
  - `server.ts` — Server Components/Actions/Route Handler'lar için, her istekte yeni client, kullanıcının oturumuna göre RLS uygular.
  - `dal.ts` — `getCurrentUser()` (misafir-güvenli, null döner) ve `verifySession()` (girişsizse `/login`'e redirect); korumalı sayfaların tek doğrulama noktası, `server-only` ile client bundle'a sızması engellenir.
  - `is-configured.ts` — Supabase env değişkenleri boşken bile middleware ve sayfaların çökmemesini sağlayan guard.
- **Çift katmanlı yetkilendirme**: `middleware.ts` ucuz, cookie tabanlı bir ön kontrol yapar (asıl güvenlik sınırı değildir); her korumalı sayfa ayrıca sunucu tarafında `verifySession()` çağırır. Veritabanı seviyesinde de RLS politikaları aynı sahiplik kuralını tekrar uygular (bkz. "RLS Yapısı") — üç katman da bağımsız olarak sahiplik kontrolü yapar.
- **Server Actions + Zod**: Tüm yazma işlemleri (`actions.ts`) sunucu tarafında Zod ile doğrulanır; formlar `useActionState` (auth/profil) veya `react-hook-form` + zod resolver (ilan formu) kullanır. Veritabanı `check` kısıtlamaları, Zod doğrulamasının bir savunma-derinliği yedeği olarak şemada da tekrarlanır (bkz. migration dosyalarındaki yorumlar).
- **i18n**: `next-intl`, cookie tabanlı locale (`src/i18n/`), `messages/tr.json`, `messages/ar.json`, `messages/en.json` (anahtar sayısı birebir eşleşir — 796). Desteklenen locale listesi `src/i18n/locale-config.ts`'te tek bir yerde tanımlı (`SUPPORTED_LOCALES`); yeni bir locale eklerken `profiles.language` üzerindeki DB check constraint'inin de güncellenmesi gerekir (bkz. `0052_profiles_language_add_en.sql`).
- **Sabit saat dilimi (`Europe/Istanbul`)**: uygulama tek bir hedef saat dilimi varsayar, çalışma zamanının kendi varsayılanına (yerelde geliştiricinin makinesi, production'da Vercel'in UTC'si) **hiç** güvenmez. İlan kalkış tarihi/saati oluşturma ve gösterimi `src/utils/istanbul-time.ts` üzerinden geçer (Türkiye 2016'dan beri DST kullanmıyor, bu yüzden sabit bir `+03:00` ofseti yeterli ve kesin); `next-intl`'in `timeZone` ayarı da (`src/i18n/request.ts`) tüm `format.dateTime` gösterimlerini aynı şekilde sabitler. Tekrarlanan ilan cron'u (`generate_recurring_rides`, `0039`) da aynı gerekçeyle veritabanı içinde açıkça `Europe/Istanbul` kullanır. Bkz. CHANGELOG → "Kritik — saat dilimi" için bu olmadan yaşanan gerçek production hatası.
- **Kural-tabanlı dolandırıcılık/kötüye kullanım tespiti (v1→v2)**: `admin_get_suspicious_accounts` (`0026`, `0028`/`0029`, `0042`, `0045`/`0046`), toplam **10** basit eşiği (ilan/rezervasyon yoğunluğu, iptal/red oranı, yeni-hesap-yüksek-tutar, geç iptal, yolcu/sürücü no-show, aynı IBAN'ın birden fazla hesapta kayıtlı olması, tekrar şikayet edilme, tekrarlanan dekont/iade reddi) `/admin/users` ve `/admin/payments` üzerinde işaretler. **Bir ML sistemi değildir** — eşikler gerçek kullanım verisiyle ayarlanması gereken makul varsayımlardır; kesin kanıt değil, yalnızca admin'in gözden geçirmesi gereken bir işarettir.

## Klasör Yapısı

```
src/
  app/
    (auth)/                  # login, register, forgot/reset-password, verify-email + ortak AuthLayout
    auth/callback/            # Supabase e-posta onay linki callback'i
    verify-phone/             # hesap doğrulama sayfası (e-posta kodu — bkz. Özellikler)
    profile/                  # korumalı profil sayfası
    rides/                    # herkese açık ilan listesi (arama/filtre/sıralama/yakın-il/arama uyarısı)
    rides/mine/                 # korumalı: "Benim İlanlarım"
    rides/[id]/                  # herkese açık: ilan detay + rezervasyon/bekleme listesi butonu
    rides/[id]/edit/             # korumalı: ilan düzenleme
    rides/[id]/bookings/          # korumalı: sürücünün rezervasyon onay paneli + alım kodu girişi
    rides/[id]/chat/              # korumalı: sürücü/yolcu 1:1 sohbet + konum paylaşımı
    create-ride/                 # korumalı: ilan oluşturma (+ "her hafta tekrarla")
    bookings/                    # korumalı: "Benim Rezervasyonlarım" + alım kodu gösterimi + dekont yükleme
    admin/                       # korumalı (admin-only): analytics, users, rides, payments, disputes
    kvkk/, privacy/, terms/       # KVKK/Gizlilik/Kullanım Şartları — veri sorumlusu Ahmed Alsalem, şahıs faaliyeti (şirket/MERSİS yok)
    how-it-works/, support/        # bilgilendirme sayfaları
    suspended/                    # askıya alınmış kullanıcı yönlendirme sayfası
    offline/                     # service worker fallback sayfası (bkz. PWA)
    manifest.ts                  # PWA manifest.webmanifest üretici
    error.tsx / global-error.tsx  # segment / root-layout hata sınırları
  components/
    layout/                   # Header, Footer, LocaleSwitcher, ThemeToggle, InstallAppButton, IOSInstallPrompt, WelcomeAuthModal
    ui/                       # shadcn bileşenleri
    EmptyState.tsx             # paylaşılan boş durum bileşeni
    ServiceWorkerRegister.tsx  # public/sw.js'i kaydeden client bileşeni
  features/
    auth/                     # schemas.ts, actions.ts, LoginForm, SignUpForm
    profile/                  # schemas.ts, actions.ts, queries.ts, ProfileForm, e-posta doğrulama kodu gönderme/doğrulama
    rides/                    # schemas.ts, actions.ts, queries.ts, filters.ts, reverse-geocode.ts, RideForm, RideCard, RideFilters, RideStatusBadge, CancelRideButton
    bookings/                 # schemas.ts, actions.ts, queries.ts, BookingButton, BookingActions, BookingStatusBadge, CancelBookingButton, dekont/iade upload bileşenleri
    chat/                     # schemas.ts, actions.ts, queries.ts (getUnreadMessages dahil), ChatWindow, MessageBubble, MessageInput, PassengerPicker
    reviews/                  # schemas.ts, actions.ts, queries.ts, ReviewForm, ReviewButton, ReviewCard, ReviewSection, StarRating(Input)
    waitlist/                 # actions.ts, queries.ts — bekleme listesine katılma/ayrılma
    search-alerts/            # actions.ts, queries.ts — "bu güzergahta ilan açılınca haber ver"
    live-location/            # actions.ts, queries.ts — sürücü canlı konum paylaşımı (Realtime)
    disputes/                 # schemas.ts, actions.ts, queries.ts, DisputeStatusBadge, AdminDisputeResolveActions
    pickup/                   # schemas.ts, actions.ts, queries.ts — 4 haneli alım doğrulama kodu
    notifications/            # actions.ts, queries.ts — nav rozeti (notification_events) okuma/işaretleme
    push/                     # actions.ts — Web Push abonelik yönetimi
    admin/                    # queries.ts, actions.ts, risk.ts (dekont risk katmanı), admin bileşenleri
  lib/
    supabase/                 # server.ts (Server Components/Actions), client.ts (tarayıcı — Realtime için), dal.ts, is-configured.ts
    zod-error.ts               # paylaşılan zod hata mesajı yardımcı fonksiyonu
    rate-limit.ts              # Upstash Redis tabanlı (yereldeyken process-memory'e düşen) sabit-pencere rate limiter
    logger.ts                  # merkezi hata loglama (Sentry'ye bağlı)
    notifications.ts           # Web Push (VAPID) ile gerçek push notification gönderimi
    email.ts                   # Resend ile e-posta gönderimi (doğrulama kodu + bildirimler)
    ocr.ts                     # tesseract.js ile yolculuk sonrası (settlement) dekontundan IBAN/tutar çıkarımı (bkz. Özellikler)
  sentry.server.config.ts / sentry.edge.config.ts   # Sentry hata izleme yapılandırması
  instrumentation.ts           # Next.js instrumentation hook'u (Sentry init'i içerir)
  i18n/                       # locale-config.ts, locale.ts, request.ts
  types/                      # profile.ts, ride.ts, booking.ts, message.ts, review.ts, dispute.ts
  utils/                      # turkish-provinces.ts (81 il), turkish-provinces-ar.ts (AR görünen adları), turkish-provinces-geo.ts (il merkezi koordinatları), currency.ts, istanbul-time.ts
  middleware.ts               # Supabase session refresh + korumalı rota kontrolü
messages/                      # tr.json, ar.json, en.json
loadtest/                      # k6 yerine Node/@supabase-js tabanlı yük testi script'leri — bkz. Bilinen Sınırlamalar için sonuçlar
e2e/                            # Playwright uçtan uca testleri — 14 dosya: booking-chat-review, double-booking, payment-review, new-features, passenger-listing, has-ac-filter, instant-booking, cash-payment, settlement-ocr-auto-approval, disputes, pickup-verification, bulk-receipt-approval, fraud-detection, cost-estimate
public/
  sw.js                        # temel offline fallback service worker
  icons/, apple-touch-icon.png # PWA ikonları
supabase/
  migrations/                  # 0001–0067, bkz. "Migration Sırası"
```

## Kurulum

```bash
npm install
cp .env.example .env.local
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresini açın. `.env.local` boşken de uygulama tamamen çalışır (bkz. "Bilinen Sınırlamalar").

## Environment Variables

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldurun:

| Değişken | Açıklama |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje URL'i (tarayıcı + sunucu) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (tarayıcı + sunucu) |
| `NEXT_PUBLIC_SITE_URL` | Deploy edilen gerçek domain (`https://...`) — `sitemap.ts`/`robots.ts`/`metadataBase`/canonical URL'ler bunu kullanır. **Boşsa (veya production'da ayarlanmamışsa) sitemap, robots.txt ve OpenGraph görselleri `http://localhost:3000` gösterir** — production'da mutlaka ayarlanmalı. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics (Consent Mode v2) ölçüm ID'si. Boşsa `gtag` hiç yüklenmez, tamamen no-op. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (VAPID) anahtar çifti — `npx web-push generate-vapid-keys` ile ücretsiz üretilir, üçüncü taraf hesap gerekmez. Boşsa push gönderimi no-op'a düşer. |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Sentry hata izleme. `SENTRY_AUTH_TOKEN` yalnızca build sırasında source map yüklemek için gerekir. Boşsa Sentry devre dışı kalır. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiter'ın (`src/lib/rate-limit.ts`) çoklu-instance production'da paylaşılan durumu için kullandığı Upstash Redis REST kimlik bilgileri (ücretsiz katman: [console.upstash.com](https://console.upstash.com)). **Production'da zorunlu** — eksikse ilk rate-limit'li istekte hata fırlatılır; yerelde boşken process-memory limiter'a düşer. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | E-posta bildirimi ve **zorunlu hesap doğrulama kodu** (`src/lib/email.ts`) için Resend kimlik bilgileri (ücretsiz katman: [resend.com](https://resend.com)). Boşsa no-op'a düşer — ama bu durumda kullanıcılar hesap doğrulama kodunu hiç alamaz, doğrulama gerektiren akışlar fiilen kilitlenir. |
| `SUPABASE_AUTH_SMS_TWILIO_*` | Artık kullanılmıyor (SMS/OTP doğrulaması e-posta koduna taşındı, bkz. Özellikler). Geriye dönük uyumluluk için `.env.example`'da duruyor, boş bırakılabilir. |

Uygulama kodu yalnızca `NEXT_PUBLIC_*` değişkenlerini okur (`src/lib/supabase/*`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/layout.tsx`). **`service_role` anahtarı hiçbir yerde kullanılmaz ve bu projede gerekmez** — tüm sunucu tarafı erişim, oturum sahibinin RLS'e tabi anon/authenticated bağlamıyla yapılır.

Supabase kimlik bilgileri boşken uygulama misafir modunda çalışır: `/`, `/rides` gibi herkese açık sayfalar normal render olur; `/profile`, `/create-ride`, `/rides/mine`, ilan düzenleme gibi korumalı sayfalar `/login`'e yönlendirir; giriş/kayıt/ilan formları çökmeden dostane bir "yapılandırılmamış" hatası gösterir. Bu davranış `src/lib/supabase/is-configured.ts` tarafından yönetilir.

## Supabase Kurulumu

1. [supabase.com](https://supabase.com) üzerinde yeni bir proje oluşturun.
2. Proje ayarlarından **Project URL** ve **anon/public key** değerlerini alıp `.env.local`'e yazın.
3. Supabase CLI ile projeyi bağlayın:

```bash
npm run db:link    # supabase link (proje referans ID'nizi ister)
```

4. **Authentication → URL Configuration** altında **Site URL**'i deploy edilecek domain'e ayarlayın (yerelde `http://localhost:3000`, production'da gerçek domain).
5. Aynı ekranda **Redirect URLs** listesine `<domain>/auth/callback` ekleyin — e-posta onay linki bu route'a döner (bkz. `src/app/auth/callback/route.ts`).
6. **Storage**: `avatars` (public) ve `payment-receipts` (private) bucket'ları ve politikaları migration ile otomatik oluşturulur (aşağıya bakın), manuel kurulum gerekmez.

## Migration Sırası

```bash
npm run db:push               # supabase/migrations/*.sql dosyalarını uzak projeye sırayla uygular
npm run db:migration:new ad   # yeni bir migration dosyası oluşturur
npm run db:diff -- ad         # şema farkından migration üretir
```

Migration'lar dosya adı sırasına göre (`0001`, `0002`, `0003`, ...) uygulanır; sıralama bağımlıdır çünkü her migration bir öncekinin tablolarına/fonksiyonlarına referans verir:

1. `supabase/migrations/0001_profiles.sql` — `profiles` tablosu, RLS, `auth.users` insert'inde otomatik profil oluşturma trigger'ı, `set_updated_at()` yardımcı fonksiyonu, `avatars` storage bucket + politikaları.
2. `supabase/migrations/0002_rides.sql` — `rides` tablosu, indeksler, RLS (`0001`'deki `profiles` ve `set_updated_at()`'e bağımlı).
3. `supabase/migrations/0003_bookings.sql` — `bookings` tablosu, indeksler, RLS, çifte-rezervasyon koruması (partial unique index) ve `approve_booking`/`reject_booking`/`cancel_booking` `security definer` fonksiyonları (`0002`'deki `rides`'a bağımlı).
4. `supabase/migrations/0004_messages.sql` — `messages` tablosu, indeksler, RLS (`0002`'deki `rides` ve `0003`'teki `bookings`'e bağımlı — bir mesajın gönderilebilmesi için ilgili ilanda onaylanmış bir rezervasyon olması gerekir), tabloyu Supabase'in `supabase_realtime` publication'ına ekler.
5. `supabase/migrations/0005_reviews.sql` — `reviews` tablosu, indeksler, RLS (`0002`, `0003`'e bağımlı — bir yorumun eklenebilmesi için ilanın kalkış zamanının geçmiş olması ve aralarında onaylanmış bir rezervasyon bulunması gerekir).
6. `supabase/migrations/0006_profiles_phone_privacy.sql` — `phone`/`phone_verified` kolonlarını `profiles`'tan ayrı, sahibine sınırlı RLS'e sahip bir `profiles_private` tablosuna taşır (bkz. RLS Yapısı → "Neden `phone`/`phone_verified` ayrı bir tabloda?").
7. `supabase/migrations/0007_profile_update_atomicity.sql` — `update_own_profile` `security invoker` RPC'si (`0006`'ya bağımlı — profil ve telefon yazımını tek transaction'da birleştirir).
8. `supabase/migrations/0008_reviews_per_reviewee.sql` — `reviews` unique index'ini `(ride, reviewer)`'den `(ride, reviewer, reviewed_user)`'e genişletir; bir sürücünün birden fazla onaylanmış yolcusu varsa her birini ayrı değerlendirebilmesini sağlar.
9. `supabase/migrations/0009_ride_districts.sql`–`0012_push_subscriptions.sql` — ilan ilçe alanları, telefon doğrulama (o zamanki SMS/OTP tabanlı hâli — sonradan `0035`'te terk edildi), otomatik tamamlanma (`pg_cron`), push subscription tablosu (bkz. CHANGELOG için ayrıntı).
10. `supabase/migrations/0013_editable_messages_reviews.sql` — `messages`/`reviews`'a `edited_at`/`deleted_at` kolonları ve yazar/gönderen için 15 dakikalık düzenleme/yumuşak-silme penceresi uygulayan `edit_message`/`soft_delete_message`/`edit_review`/`soft_delete_review` `security definer` RPC'leri (`0004`, `0005`'e bağımlı).
11. `supabase/migrations/0014_admin.sql`–`0023_fix_receipt_status_cast.sql` — minimal admin paneli (`admin_flags` + `is_admin`/`is_suspended`), cinsiyet/yarı-yarı ödeme akışı + IBAN altyapısı (`profiles_private.gender`/`iban`), ilan tercihleri (araç marka/model, evcil hayvan/sigara, VIP), sohbette konum paylaşımı, ödeme dekontu upload + admin inceleme (`payment-receipts` private bucket), iptal sonrası iade akışı, admin'in bookings'i görebilmesi için RLS düzeltmesi (bkz. CHANGELOG için ayrıntı).
12. `supabase/migrations/0024_cancel_expired_pending_bookings.sql` — süresi geçmiş, hâlâ `awaiting_deposit` olan `pending` rezervasyonları otomatik iptal eden pg_cron job'u (`0011` ile aynı desen).
13. `supabase/migrations/0025_settlement_receipts_and_reject_reasons.sql` — kalan ödeme (ikinci yarı) için deposit ile aynı desende dekont upload + admin inceleme, deposit/settlement/iade red gerekçesi kolonları + RPC parametreleri, admin'in iade kanıtını reddedebilmesi (`admin_reject_refund_proof`), admin'in deposit incelerken sürücü IBAN'ını görebilmesi (`admin_get_driver_payment_info`).
14. `supabase/migrations/0026_suspicious_accounts.sql` — kural-tabanlı (v1) şüpheli hesap tespiti, dört kural (`admin_get_suspicious_accounts`).
15. `supabase/migrations/0027_ride_counterparty_email.sql` — e-posta bildirimi için karşı tarafın e-postasını okuyan RPC (`get_ride_counterparty_email`).
16. `supabase/migrations/0028_new_account_high_value_rule.sql` + `0029_new_account_high_value_rule_apply.sql` — beşinci şüpheli hesap kuralı: hesap 48 saatten yeni **ve** ₺300+ masraf paylı bir ilan açmış ("sahte ilan ver, depozito topla, kaybol" paterni, tek ilan bile yeterli sinyal). Enum değeri ile onu kullanan fonksiyon, Postgres'in "aynı transaction'da yeni enum değeri kullanılamaz" kısıtı yüzünden iki ayrı migration'dadır.
17. `supabase/migrations/0030_female_driver_filter.sql`, `0031_remove_women_only.sql`, `0033_female_driver_filter_open.sql` — "kadın şoför" arama filtresi eklendi (`get_female_driver_ride_ids`, önce yalnızca kadın kullanıcılar için, sonra herkese açıldı); bunun ters yönü olan eski "yalnızca kadın yolcu" (`women_only`) ilan filtresi, production'da hiç kullanılmadığı doğrulandıktan sonra kaldırıldı.
18. `supabase/migrations/0032_ride_search_and_unread_indexes.sql` — performans indeksleri: `/rides` filtreli aramasını (durum + şehir + ilçe + kalkış zamanı) ve üst menüdeki okunmamış mesaj sayımını sequential scan'den kurtaran kompozit/partial indeksler.
19. `supabase/migrations/0034_fix_sync_verified_phone_format.sql` — `sync_verified_phone` trigger'ının `auth.users.phone`'u (Ø prefiksiz) `profiles_private.phone`'a (E.164, `+` prefiksli) format uyuşmazlığıyla yazdığı, bu yüzden bir sonraki profil kaydında doğrulamanın sessizce sıfırlandığı hatanın düzeltmesi.
20. `supabase/migrations/0035_email_based_verification.sql` — **zorunlu hesap doğrulamasının SMS/OTP'den (Twilio) e-posta koduna (Resend) taşınması** — bkz. Özellikler → "Kimlik doğrulama ve hesap onayı". `sync_verified_phone` trigger'ı (artık hiç tetiklenmeyen dead code) kaldırılır, `verify_email_otp` RPC'si eklenir.
21. `supabase/migrations/0036_notification_events.sql` — üst menüdeki "İlanlarım"/"Rezervasyonlarım" öğelerinde "yeni bir şey var" kırmızı nokta rozeti için `notification_events` tablosu.
22. `supabase/migrations/0037_ride_counterparty_phone.sql` — onaylanmış rezervasyonlarda taraflar arasında karşılıklı telefon numarası paylaşımı (`get_ride_counterparty_phone`).
23. `supabase/migrations/0038_ride_live_locations.sql` — sürücünün canlı konumunu onaylı yolcu(lar)ıyla Realtime üzerinden paylaşması (`ride_live_locations`, tek satır/ilan).
24. `supabase/migrations/0039_ride_series.sql` — tekrarlanan (haftalık) ilan serisi (`ride_series`) + her gece çalışan, bir sonraki haftanın ilanını otomatik açan `generate_recurring_rides` cron'u.
25. `supabase/migrations/0040_ride_waitlist.sql` — dolu ilan için bekleme listesi (`ride_waitlist`); `cancel_booking`'in imzası değişir (artık koltuğun gerçekten boşalıp boşalmadığını `boolean` olarak döner, `seat_freed_at` kolonu eklenir).
26. `supabase/migrations/0041_no_show_and_late_cancellation.sql` — no-show/geç iptal takibi: `bookings.cancelled_at`/`passenger_no_show`/`driver_no_show` kolonları, `report_no_show` RPC'si.
27. `supabase/migrations/0042_suspicious_accounts_no_show_rules.sql` — şüpheli hesap kural motoruna `0041`'in ürettiği sinyalleri (geç iptal, yolcu/sürücü no-show) ekleyen üç yeni kural (toplam 7).
28. `supabase/migrations/0043_ride_search_alerts.sql` — "bu güzergahta ilan açılınca haber ver" arama uyarıları (`ride_search_alerts`), ilan başına en fazla bir kez bildirim garantisi (`ride_search_alert_dispatches`).
29. `supabase/migrations/0044_disputes.sql` — formal anlaşmazlık (itiraz) çözüm sistemi: `disputes` tablosu, `open_dispute`/`admin_set_dispute_status` RPC'leri, `/admin/disputes` kuyruğu.
30. `supabase/migrations/0045_fraud_v2_columns_and_enum.sql` + `0046_suspicious_accounts_fraud_v2.sql` — dolandırıcılık tespiti v2: üç yeni sinyal (aynı IBAN'ın birden fazla hesapta kayıtlı olması, tekrar şikayet edilme, tekrarlanan dekont/iade reddi) — toplam **10** kural.
31. `supabase/migrations/0047_bulk_receipt_review.sql` — risk katmanlı toplu dekont onayı (`admin_bulk_approve_receipts`) — yalnızca dar, kural-tabanlı "güvenilir" katmanı (hesap yaşı ≥14 gün, şüpheli değil, geçmiş red yok, açık anlaşmazlık yok) fast-track'ler; OCR/tutar doğrulaması yapmaz.
32. `supabase/migrations/0048_pickup_verification_code.sql` — 4 haneli alım doğrulama kodu (`booking_pickup_codes`, `get_my_pickup_code`/`verify_pickup_code`/`get_pickup_verification_status`) — bkz. RLS Yapısı için bu tablonun RLS'siz tasarımı.
33. `supabase/migrations/0049_fix_search_alert_recipients_email_cast.sql` — `get_search_alert_recipients`'te bir tip cast hatasının düzeltmesi.
34. `supabase/migrations/0050_car_plate.sql` — `profiles.car_plate` kolonu (`car_brand`/`car_model` ile aynı gerekçe, `0018`), `update_own_profile`'ın genişletilmiş imzası.
35. `supabase/migrations/0051_car_plate_format_check.sql` — `car_plate` için standart Türk plaka formatını zorunlu kılan bir check constraint, **`NOT VALID`** olarak eklendi (var olan satırları geriye dönük doğrulamaz, yalnızca bundan sonraki INSERT/UPDATE'leri zorlar).
36. `supabase/migrations/0052_profiles_language_add_en.sql` — `profiles.language` check constraint'ine `'en'` eklendi (İngilizce locale desteğiyle birlikte; unutulsaydı bir kullanıcının profilde İngilizce'yi dil olarak seçip kaydetmesi DB seviyesinde hata verirdi).
37. `supabase/migrations/0053_deposit_ocr_auto_approval.sql` — kapora dekontu OCR ile otomatik onay: `bookings`'e `deposit_ocr_iban`/`deposit_ocr_amounts`/`deposit_ocr_checked_at` kolonları, `submit_deposit_receipt_ocr` RPC'si (IBAN/tutar eşleşmesini ve risk katmanını veritabanı içinde yeniden doğrular, uygunsa onaylar, `deposit_receipt_status`'u da `approved`'a çeker ki admin kuyruğunda "bekliyor" görünmeye devam etmesin). Ayrıca iki yan düzeltme: `approve_booking`'in asıl etkisi (koltuk düşümü + alım kodu üretimi) `_apply_booking_approval` adlı paylaşılan bir yardımcıya çıkarıldı (manuel ve otomatik onay artık aynı kodu kullanıyor); ve `admin_get_suspicious_accounts`'taki `0026`'dan beri var olan gerçek bir hata düzeltildi (`admin_flags af on af.id = ...` — tablonun PK'si `user_id`, `id` diye bir kolon hiç yoktu; fonksiyon her çağrıldığında hata fırlatıyordu, `getSuspiciousAccounts()` bu hatayı hiç kontrol etmeden yutup sessizce boş dizi döndürdüğünden `/admin/users`'taki şüpheli hesap listesi ve `/admin/payments`'taki risk rozetleri kuruluşundan beri hep boş/"suspicious değil" gösteriyordu).
38. `supabase/migrations/0054_settlement_ocr_auto_approval.sql` — aynı OCR otomatik onay mantığını kalan ödeme (settlement) dekontuna taşır: `bookings`'e `settlement_ocr_iban`/`settlement_ocr_amounts`/`settlement_ocr_checked_at` kolonları, `submit_settlement_receipt_ocr` RPC'si. Kapora'dan farkı: eşleşme, karşılıklı onay gerektiren `confirm_remaining_payment`'ın **her iki tarafını da** (driver_settled_at + passenger_settled_at) tek seferde işaretler — yolcunun doğru IBAN'a doğru tutarı gösteren bir dekont yüklemesi zaten kendi "gönderdim" beyanının kanıtı olduğundan, ayrıca "Kalan Ödeme Tamamlandı" butonuna bastırmak gereksiz bir sürtünme olurdu.
39. `supabase/migrations/0055_no_show_dispute_reason.sql` — `public.dispute_reason` enum'ına `'no_show'` değerini ekler (`0056`'nın `report_no_show`'un artık otomatik açtığı anlaşmazlığı bu gerekçeyle işaretleyebilmesi için; Postgres'in "aynı transaction'da yeni enum değeri kullanılamaz" kısıtı yüzünden `0028`/`0029`'daki desende ayrı bir migration'da).
40. `supabase/migrations/0056_no_show_tightening_and_deposit_ratio.sql` — ödeme koruması sıkılaştırması (Faz 1): `report_no_show` artık aynı transaction'da karşı tarafa karşı otomatik bir `no_show` anlaşmazlığı açıyor; no-show'un şüpheli-hesap eşiği 2 → 1'e çekildi (ilk olay bile admin kuyruğuna düşer); `confirm_remaining_payment`/`submit_settlement_receipt`/`submit_settlement_receipt_ocr`, `driver_no_show` işaretli bir rezervasyonda kalan ödeme akışını (manuel buton + dekont yükleme + OCR otomatik onay) reddediyor; ve kapora oranı **%50 → %25**'e düştü (kalan ödeme buna karşılık **%75** oldu — bu oran birkaç migration sonra `0062`'de tamamen kaldırılacak, bkz. aşağıda).
41. `supabase/migrations/0057_passenger_listings_schema.sql` — Faz 2A, yolcu ilanları (ters rezervasyon) backend temeli: `posted_by`/`posted_by_role` ile "ilan sahibi" `driver_id`'den ("bu yolculuğun onaylanmış sürücüsü") ayrıştırılıyor — sürücü ilanında ikisi aynı, yolcu ilanında `driver_id` onay anına kadar `NULL`. `bookings`'e de aynı şekilde `booker_role` eklendi.
42. `supabase/migrations/0058_passenger_listings_rls.sql` — RLS politikaları `posted_by`/`booker_role`'e göre genişletildi; sürücü ilanı akışı birebir korunuyor.
43. `supabase/migrations/0059_passenger_listings_approve_reject.sql` — `approve_booking`/`reject_booking` rol-farkında hâle getirildi: sürücü ilanında eski davranış (yalnızca `rides.driver_id` onaylar/reddeder) aynen sürerken, yolcu ilanında ilan sahibi (yolcu) teklifleri onaylar/reddeder, onay anında teklif veren sürücü `rides.driver_id`'ye atanır (`_apply_booking_approval`'a yeni opsiyonel parametre).
44. `supabase/migrations/0060_passenger_listings_final_review_fixes.sql` — Faz 2A çapraz kesitli final review'da bulunan üç gerçek üretim hatasının düzeltmesi (ör. `generate_recurring_rides`'ın yeni zorunlu `posted_by` kolonunu hiç doldurmaması, pg_cron'u her gece sessizce tüm seriler için patlatıyordu).
45. `supabase/migrations/0061_passenger_listing_offer_fixes.sql` — Faz 2B, gerçek bir Supabase örneği olmadan test edilemeyen üç eksiğin düzeltmesi: `bookings_one_active_per_passenger_ride` unique index'inin yolcu-ilanı tekliflerinde (`booker_role='driver'`, `passenger_id` her zaman ilan sahibiyle aynı) doğru davranması dahil.
46. `supabase/migrations/0062_single_payment_at_settlement.sql` — **kritik model değişikliği**: %25 kapora + %75 kalan ödeme iki aşamalı akışı tamamen kaldırılıyor, tek ödeme yolculuk sonunda tam tutar olarak yapılıyor (bkz. Özellikler → "Ödeme takibi"). `approve_booking` artık ödemeyle ilgisiz, salt onay; `submit_deposit_receipt`/`submit_deposit_receipt_ocr`/`admin_review_deposit_receipt` tamamen kaldırılıyor; `booking_payment_status.awaiting_deposit` → `awaiting_settlement` olarak yeniden adlandırılıyor (`deposit_confirmed` enum'da fiziksel kalıyor ama hiçbir kod yolu artık üretmiyor); `admin_bulk_approve_receipts` tek parametreli (yalnızca settlement) hâline indirgeniyor.
47. `supabase/migrations/0063_offer_driver_readiness_rpc.sql` — yolcu ilanına teklif veren sürücünün IBAN/plaka bilgisinin dolu olup olmadığını ilan sahibinin onay öncesi kontrol edebilmesi için `get_offer_driver_readiness` RPC'si (eskiden `profiles_private`'a doğrudan sorgu atılıyordu, RLS'e takılıyordu — sahibi olmayan biri başka birinin `profiles_private` satırını okuyamaz).
48. `supabase/migrations/0064_ride_payment_method.sql` — sürücü ilanlarında banka havalesi/nakit ödeme yöntemi seçimi (`ride_payment_method` enum, `rides.payment_method`).
49. `supabase/migrations/0065_instant_booking.sql` — anında onay (`rides.instant_booking`) + `create_booking` RPC: koltuk kontrolünü `for update` ile atomik hale getirip (eskiden yalnızca uygulama katmanındaydı) uygunsa aynı transaction'da otomatik onaylıyor.
50. `supabase/migrations/0066_profile_has_ac.sql` — profilde klima (`has_ac`) bilgisi + arama filtresi.
51. `supabase/migrations/0067_new_ride_broadcast.sql` — her yeni ilanda **tüm üyelere** (yalnızca arama uyarısı kuranlara değil) e-posta bildirimi: `get_all_member_emails_for_broadcast` RPC'si, `ride_broadcast_dispatches` ile ilan başına tek gönderim garantisi, ilanı yayınlayan hariç tutulur. Arama uyarılarının aksine opt-in değildir — bkz. Bilinen Sınırlamalar.

## RLS Yapısı

Tüm tablolarda RLS etkin; politikalar "herkes okuyabilir, yalnızca sahibi yazabilir" prensibini uygular ve uygulama katmanındaki sahiplik kontrolünü veritabanı seviyesinde tekrarlar (savunma derinliği):

| Tablo | Policy | Kural |
|---|---|---|
| `profiles` | `select all profiles` | Herkes (anon dahil) okuyabilir — `phone`/`phone_verified`/`gender`/`iban` bu tabloda **değildir**, bkz. aşağıda |
| `profiles` | `update own profile` | Yalnızca `auth.uid() = id` |
| `profiles_private` | `select/insert/update own phone` (gender/iban/e-posta kodu dahil) | Yalnızca `auth.uid() = id` (`to authenticated`) — başka kimse (anon dahil) hiçbir satırı göremez |
| `rides` | `select all rides` | Herkes (anon dahil) okuyabilir |
| `rides` | `insert own ride` | Yalnızca giriş yapmış, askıya alınmamış kullanıcı, yalnızca kendi `driver_id`'siyle |
| `rides` | `update own ride` | Yalnızca sahibi **ve** satırın mevcut durumu `active` ise düzenleyebilir; `with check` durumu sınırlamaz, böylece `active → cancelled` geçişi (iptal) izinlidir |
| `bookings` | `select own or driver bookings` | Yolcu kendi rezervasyonunu, sürücü kendi ilanına gelen rezervasyonları, **admin herkesinkini** görebilir |
| `bookings` | `insert own booking` | Yalnızca giriş yapmış, askıya alınmamış kullanıcı, yalnızca kendi `passenger_id`'siyle |
| `messages` | `select own messages` | Yalnızca gönderen veya alıcı okuyabilir (Realtime abonelikleri de bu policy'ye tabidir) |
| `messages` | `insert own message` | Yalnızca kendi adına, askıya alınmamış, ve yalnızca ilanın sürücüsüyle onaylanmış rezervasyonu olan yolcu arasında |
| `messages` | `update own received message` | Yalnızca alıcı, yalnızca `read_at`'i ("görüldü") işaretlemek için |
| `reviews` | `select all reviews` | Herkes (anon dahil) okuyabilir |
| `reviews` | `insert own review` | Yalnızca kendi adına, askıya alınmamış; ilanın kalkış zamanı geçmiş **ve** iki taraf arasında onaylanmış bir rezervasyon varsa |
| `push_subscriptions` | `select/insert/update/delete own` | Yalnızca `auth.uid() = user_id`; karşı tarafın aboneliklerine erişim yalnızca dar kapsamlı RPC'ler (`get_ride_counterparty_push_subscriptions` vb.) üzerinden |
| `notification_events` | `select/update own` | Yalnızca `auth.uid() = recipient_id`; **insert için politika yok** — olayı tetikleyen taraf karşı tarafın satırını oluşturur, bu yalnızca `create_notification_event` RPC'siyle mümkündür |
| `ride_live_locations` | `select as driver or approved passenger` | Sürücü kendi konumunu, onaylı rezervasyonu olan yolcu(lar) sürücünün konumunu görebilir |
| `ride_live_locations` | `insert/update own` | Yalnızca `driver_id = auth.uid()` ve ilanın gerçek sahibi |
| `ride_series` | `select/insert/update own` | Yalnızca `auth.uid() = driver_id` |
| `ride_waitlist` | `select own` / `driver selects own ride waitlist` | Yolcu kendi kaydını, sürücü kendi ilanının bekleme listesini (yalnızca sayı için UI'da kullanılıyor) görebilir |
| `ride_waitlist` | `insert/update/delete own` | Yalnızca `auth.uid() = passenger_id`, yalnızca ilan hâlâ aktif/dolu ve kalkmamışsa |
| `ride_search_alerts` | `select/insert/update/delete own` | Yalnızca `auth.uid() = user_id` |
| `ride_search_alert_dispatches` | *(politika yok)* | Hiçbir client rolü okuyamaz/yazamaz — yalnızca `get_search_alert_recipients` RPC'si üzerinden, "ilan başına en fazla bir kez bildirim" garantisini korumak için |
| `ride_broadcast_dispatches` | *(politika yok)* | Aynı desen (`0067`) — yalnızca `get_all_member_emails_for_broadcast` RPC'si üzerinden, "ilan başına en fazla bir kez toplu e-posta" garantisini korumak için |
| `disputes` | `select own or against or admin` | Açan taraf, karşı taraf ya da admin görebilir; **insert/update politikası yok** — yalnızca `open_dispute`/`admin_set_dispute_status` RPC'leri üzerinden yazılır |
| `booking_pickup_codes` | *(hiçbir RLS politikası yok — select dahil)* | Kasıtlı: kodun sürücü tarafından doğrudan bir sorguyla okunabilmesi, "yolcuya sorup sözlü doğrulama" amacını ortadan kaldırırdı. Tüm erişim `get_my_pickup_code` (yalnızca yolcu), `get_pickup_verification_status` (her iki taraf, yalnızca boolean) ve `verify_pickup_code` (yalnızca sürücü) RPC'leri üzerinden |

`profiles` ve `rides` için `insert`/`delete` politikası tanımlı değildir: profil satırları yalnızca `handle_new_user()` trigger'ı ile (yeni `auth.users` kaydında, `security definer`) oluşturulur; ilanlar hiçbir zaman silinmez, yalnızca `status = 'cancelled'` olarak güncellenir.

**Neden `phone`/`phone_verified`/`gender`/`iban` ayrı bir tabloda?** RLS satır bazlıdır, kolon bazlı değil — `profiles` üzerindeki genel `select all profiles` politikası (herkese açık ilan/profil gösterimi için gerekli) bir satırı görünür kıldığında o satırın **tüm** kolonlarını görünür kılar. Bu hassas alanları `profiles`'ta tutmak, onları da anon dahil herkese açık hale getirirdi. Bunun yerine yalnızca sahibinin okuyabildiği ayrı bir `profiles_private` tablosunda tutulur (`0006`, `0016`). Profil güncelleme formu tek bir `update_own_profile` `security invoker` RPC'si üzerinden ilgili tabloları **tek transaction'da** günceller.

**Neden `phone_verified` hâlâ bu isimde?** `0035_email_based_verification.sql`, doğrulama kanalını SMS'ten e-posta koduna taşırken sütun adını değiştirmedi — `profiles_private.phone_verified`, artık gerçekte "hesap e-posta koduyla doğrulandı mı" anlamına gelir, ismiyle çelişir. Bu, kod okuyan biri için kafa karıştırıcı olabilir; sütunu yeniden adlandırmak ayrı bir migration + tüm çağıran kod tabanının güncellenmesini gerektirir, bu oturumun kapsamında yapılmadı.

`bookings` için **kasıtlı olarak `update` politikası tanımlı değildir**: status geçişleri (onay/red/iptal) yalnızca `approve_booking`/`reject_booking`/`cancel_booking` adlı `security definer` Postgres fonksiyonları üzerinden yapılabilir (doğrudan bir `.update()` çağrısıyla booking status'u değiştirilemez). Bu fonksiyonlar:

- İlgili `rides` ve `bookings` satırlarını `select ... for update` ile kilitler, böylece aynı ilana eşzamanlı iki onaylama isteği serileşir — son koltuk için çifte onay (race condition) imkansızdır.
- Kendi içlerinde `auth.uid()` ile yetki kontrolü yapar (driver-only onay/red, passenger-only iptal).
- `approve_booking`, `rides.available_seats`'i atomik olarak düşürür (0'a inerse `status = 'full'`) ve bir alım doğrulama kodu üretir (`0048`) — ödemeyle ilgisizdir, `payment_status` insert'teki `awaiting_settlement` varsayılanında kalır (`0062`, bkz. Özellikler → "Ödeme takibi"); `cancel_booking`, önceden onaylanmış bir rezervasyon iptal edilirse koltuğu iade eder (`full` ise `active`'e döner), `cancelled_at`/`seat_freed_at`'i işaretler.

Ayrıca `bookings (ride_id, passenger_id)` üzerinde bir **partial unique index** (`status in ('pending','approved')` koşuluyla) çifte rezervasyonu veritabanı seviyesinde engeller — aynı yolcu aynı ilana aktif ikinci bir talep açamaz, ama reddedilmiş/iptal edilmiş bir talepten sonra tekrar talep edebilir. Aynı desen `disputes (booking_id, opened_by)` için de geçerlidir (`status in ('open','in_review')` koşuluyla): bir kullanıcı aynı rezervasyon için aynı anda birden fazla açık anlaşmazlık açamaz.

`reviews (ride_id, reviewer_id, reviewed_user_id)` üzerinde bir **unique index** vardır (`0008`): bir kullanıcı aynı yolculukta aynı kişi için yalnızca bir kez yorum yazabilir. `reviews` ve `messages` için düz bir `update`/`delete` RLS politikası hâlâ yoktur; bunun yerine `0013_editable_messages_reviews.sql` yazar/gönderen için oluşturmadan sonraki **15 dakika içinde** düzenleme/yumuşak-silme izni veren `security definer` RPC'ler ekler. Pencere kapandıktan sonra satır yine immutable'dır; silme fiziksel değildir (`deleted_at` set edilir, uygulama katmanı bir placeholder gösterir).

**"Tamamlandı" nasıl hesaplanıyor?** `rides.status`, kalkış saati geçtiğinde `0011_ride_auto_complete.sql`'deki bir **pg_cron** job'uyla (her dakika, `security definer` bir fonksiyon üzerinden) otomatik olarak `'completed'`'e geçiyor. Bunun yanında `reviews`'ın RLS `with check`'i ve booking sayfalarındaki "yorum yap" görünürlüğü hâlâ `rides.departure_time < now()` karşılaştırmasını doğrudan kullanır — bu, cron'un her dakikalık gecikmesini beklemeden anlık doğru sonuç verir.

**Askıya alınmış kullanıcı ne yapabilir?** `admin_flags.is_suspended` doğrudan bir ban değil (bu, `service_role`/Supabase Admin API gerektirir, bkz. Environment Variables) — askıya alınmış bir kullanıcı yeni ilan/rezervasyon/mesaj/yorum oluşturamaz (`insert` politikaları `not public.is_suspended()` kontrolü ekler) ama mevcut içeriği görmeye devam eder; `/suspended` sayfasına yönlendirilir.

## Realtime Mimarisi

- **Tarayıcı client'ı** (`src/lib/supabase/client.ts`, `createBrowserClient`): bu projedeki Supabase'e dokunan tek tarayıcı-taraflı kod. Uygulamanın geri kalanı tamamen Server Components/Actions üzerinden çalışır; Realtime abonelikleri (websocket) yalnızca tarayıcıda çalışabildiği için bu istisna gereklidir.
- **Mesaj akışı (`postgres_changes`)**: `ChatWindow` bileşeni, `messages` tablosunda `ride_id` filtresiyle `INSERT`/`UPDATE` event'lerine abone olur. RLS select policy'si Realtime abonelikleri için de geçerlidir.
- **Canlı konum (`postgres_changes`)**: `ride_live_locations` (`0038`) da aynı desende Realtime publication'a eklidir — onaylı yolcunun tarayıcısı, sürücünün konum satırındaki `UPDATE` event'lerine abone olur; RLS select policy'si (yalnızca sürücü/onaylı yolcu) burada da geçerlidir.
- **"Görüldü" (seen) göstergesi**: kalıcı `read_at` kolonuna dayanır. Karşı tarafın okunmamış mesajları ekrana geldiğinde `markMessagesRead` server action'ı `read_at`'i işaretler; bu güncelleme `UPDATE` event'i olarak gönderenin ekranına da anlık yansır (çift tik).
- **"Yazıyor..." göstergesi**: kalıcı depolama **yok** — Supabase Realtime'ın Broadcast özelliği üzerinden, konuşmaya özel bir kanalda ephemeral bir event olarak gönderilir/dinlenir.
- **Gönderme akışı** yine bu projedeki tüm yazma işlemleri gibi bir Server Action'dır — Realtime yalnızca *okuma* tarafında (canlı güncelleme) kullanılır, INSERT/UPDATE'ler RLS'e tabi normal Supabase istemcisiyle sunucu tarafında yapılır.

## Storage Yapısı

- **`avatars`** (`public = true`, `0001_profiles.sql`): dosya yolu şeması `{user_id}/<dosya>`.

  | Policy | Kural |
  |---|---|
  | `select avatars` | Herkes okuyabilir (bucket zaten public) |
  | `insert/update/delete own avatar` | Yalnızca giriş yapmış kullanıcı, yalnızca kendi klasöründe |

- **`payment-receipts`** (`public = false`, `0020_payment_receipts.sql`): dosya yolu şeması `{booking_id}/refund-...`/`{booking_id}/settlement-...` — klasörün ilk segmenti rezervasyon id'si (eskiden bir de `deposit-...` öneki vardı; `0062`'de kapora akışıyla birlikte kaldırıldı, storage'da geçmişten kalma dosyalar hâlâ durabilir ama yeni üretilmez). Avatarların aksine **private**: ödeme dekontları hassas finansal belgeler.

  | Policy | Kural |
  |---|---|
  | `select own booking receipts` | O rezervasyonun yolcusu, ilanın sürücüsü **veya admin** okuyabilir |
  | `insert own booking receipts` | Yalnızca o rezervasyonun yolcusu veya sürücüsü yükleyebilir |

  Uygulama, imzalı (signed) URL'ler üzerinden erişir (`getSignedReceiptUrl`) — bucket private olduğundan doğrudan public URL çalışmaz.

## Development

```bash
npm run dev     # geliştirme sunucusu (Turbopack, http://localhost:3000)
npm run lint    # ESLint
npm test        # Vitest unit testleri
npm run test:e2e  # Playwright uçtan uca testleri (local Supabase gerektirir)
```

**`npm run dev` çalışırken `npm run build` çalıştırmayın** — ikisi de `.next/` dizinine yazar, aynı anda çalışırlarsa dev sunucusunun build manifest'i bozulur (`ENOENT ... _buildManifest.js.tmp...`) ve tüm rotalar HTTP 500 döner. Düzeltmek için dev sunucusunu durdurup yeniden başlatın.

## Build

```bash
npm run build   # production build (.next/), tüm sayfalar sunucu tarafında dinamik render edilir (ƒ), statik export yoktur
npm run start   # production build'i çalıştırır (önce `npm run build` gerekir)
```

## Production Deploy

### Vercel

Proje Vercel'e deploy edilmeye hazırdır ve GitHub'a bağlı sürekli deploy ile [canlıda](https://www.götürbeni.com/) çalışmaktadır:

1. Repoyu ("Import Git Repository") Vercel'e bağlayın.
2. **Environment Variables** bölümüne yukarıdaki değişkenleri girin (Production + Preview ortamları için) — `NEXT_PUBLIC_*` değişkenler build sırasında client'a gömüldüğü için ilk deploy'dan **önce** girilmelidir, sonradan eklemek rebuild gerektirir.
3. Build komutu `next build`, framework preset `Next.js` olarak otomatik algılanır; ekstra ayar gerekmez.
4. Deploy sonrası, Supabase projesinde **Authentication → URL Configuration** altında:
   - **Site URL**'i Vercel production domain'ine güncelleyin.
   - **Redirect URLs**'e Vercel domain'inizin `/auth/callback` yolunu ekleyin (örn. `https://<proje>.vercel.app/auth/callback`) — aksi halde e-posta onay linki çalışmaz.
5. Preview deploy'lar farklı bir URL kullanıyorsa, o URL'in `/auth/callback` yolunu da Redirect URLs listesine eklemeniz gerekir.

## Bilinen Sınırlamalar

- **Yük/eşzamanlılık testleri 2026-07-31'de yerel Docker + `npx supabase start` ile ilk kez çalıştırıldı** (`loadtest/`): `last-seat-race.mjs` (20 eşzamanlı `approve_booking`, 1 koltuklu ilan) ve `cancel-approve-race.mjs` (30 iterasyon eşzamanlı `cancel_booking`/`approve_booking`) **PASS** — aşırı rezervasyon veya kayıp güncelleme gözlenmedi. `browse-load.mjs` (75 sanal kullanıcı × 6 istek), `next dev` ile ilk ölçümde p50 ~14.9s/p95 ~16.6s çıkmıştı; **2026-08-03'te production build (`next build && next start`) ile tekrar ölçüldü: p50=835ms, p95=1571ms, 450/450 başarılı** — önceki yavaşlığın tamamen `next dev`'in derleme ek yükünden kaynaklandığı, gerçek bir performans sorunu olmadığı doğrulandı.
- **PWA'nın "yükle" düğmesi**: `beforeinstallprompt` olayını yakalayan özel düğme (`InstallAppButton.tsx`) iOS Safari'de hiç görünmez — bu bir platform kısıtıdır, kod tarafında düzeltilemez. `IOSInstallPrompt.tsx` bu boşluğu manuel bir Paylaş→Ana Ekrana Ekle rehberiyle dolduruyor (yalnızca gerçek Safari'de; diğer iOS tarayıcılarında kullanıcıya Safari'ye geçmesi söyleniyor) ama bu da bir UI ipucu — gerçek `beforeinstallprompt` deneyimini iOS'ta hiçbir şekilde tetikleyemez.
- **IBAN'ın gerçek sahiplik doğrulaması yok**: `profiles_private.iban`/`iban_holder_name` yalnızca format kontrolünden geçer; girilen IBAN'ın gerçekten o kullanıcıya ait olduğunu doğrulayan bir banka API entegrasyonu yok (üçüncü taraf hesap/anlaşma gerektirir, bu depoda kurulmadı). Kapora dekontu OCR'ı (bkz. Özellikler) da bunu değiştirmez — dekont görselindeki metni okur, görselin gerçek/sahte olduğunu doğrulamaz; doğru IBAN/tutarı bir görsele yazmak mümkündür (sürücünün IBAN'ı zaten yolcuya gösteriliyor). Ara çözümler: admin dekont incelerken sürücünün kayıtlı IBAN/ad bilgisini görüp göz kontrolü yapabiliyor, ve aynı IBAN'ın birden fazla hesapta kayıtlı olması artık bir şüpheli-hesap sinyali (`duplicate_iban`, `0046`) — hiçbiri gerçek bir doğrulama değil, yalnızca bir işaret/ara çözüm.
- **Dekont incelemesi çoğunlukla hâlâ manuel/yarı-otomatik**: yolculuk sonrası (settlement) dekontu için OCR ile otomatik onay var (bkz. Özellikler) ama yalnızca IBAN+tutar tam eşleştiğinde **ve** hesap düşük riskliyse devreye girer — eşleşmeyen/belirsiz/yüksek riskli her dekont yine admin incelemesi gerektirir, orada da risk katmanlı toplu onay (`0047`) yalnızca dar bir "güvenilir" katmanı fast-track'ler. OCR bir görüntü-metin okumasıdır, banka/ödeme API doğrulaması değildir.
- **Ödeme/komisyon altyapısı bilinçli olarak yok**: gerçek bir ödeme gateway'i (Stripe/iyzico vb.) entegre edilmedi ve **planlanmıyor** — komisyonsuz, doğrudan-IBAN, tek-seferde-yolculuk-sonunda ödeme modelinin (`0062`, bkz. Özellikler → "Ödeme takibi") bilinçli olarak korunmasına karar verildi (bkz. Roadmap).
- **Otomatik dolandırıcılık/kötüye kullanım tespiti kural-tabanlı bir v1→v2'dir, gerçek kanıt değildir**: `admin_get_suspicious_accounts`, toplam 10 basit eşiği (ilan/rezervasyon yoğunluğu, iptal/red oranı, yeni-hesap-yüksek-tutar, geç iptal, no-show, aynı IBAN, tekrar şikayet edilme, tekrarlanan dekont/iade reddi) işaretler — bir ML sistemi değil, eşikler gerçek kullanım verisiyle ayarlanması gereken makul varsayımlardır.
- **Cinsiyet kendi beyanına dayalıdır**: "kadın şoför" arama filtresi, kimlik doğrulamalı olmayan `profiles_private.gender` alanına dayanır — gerçek bir kimlik doğrulaması yoktur.
- **Her yeni ilanda TÜM üyelere giden e-posta bildiriminin abonelikten çıkma seçeneği yok**: `get_all_member_emails_for_broadcast` (`0067`) filtre uygulamadan `profiles` tablosundaki her kullanıcıya (askıya alınmış/doğrulanmamış/hiç aktif olmayan hesaplar dahil) e-posta gönderir — arama uyarılarının aksine (opt-in), bu bilinçli bir kullanıcı kararıydı. Kullanıcı sayısı arttıkça bu bir teslim edilebilirlik/spam-şikayeti/Resend rate-limit riski taşır; gönderim de kademesiz (`Promise.all`, tek seferde).

Faz 7'den Faz 15'e kadar çözülen maddeler (otomatik `completed` geçişi, şehir autocomplete, AR il isimleri, push notification, rate limiting'in Upstash'e taşınması, harita/GPS filtresi, admin paneli, deposit-deadline cron, kalan ödeme dekontu, red gerekçesi, e-posta bildirimi, kural-tabanlı dolandırıcılık tespiti v1, gerçek coğrafi "yakın il" araması, telefon SMS/OTP'sinin e-posta koduna geçişi) artık bu listede değil — ayrıntı için [CHANGELOG.md](./CHANGELOG.md) ve [PROJECT_STATUS.md](./PROJECT_STATUS.md) dosyalarına bakın.

## Roadmap

Şu anda planlanan, onay bekleyen yeni bir özellik yok. Not: bir ödeme gateway'i (Stripe/iyzico vb.) entegrasyonu **bilinçli olarak reddedildi** — komisyonsuz, doğrudan-IBAN modelinin korunmasına karar verildi (bkz. Bilinen Sınırlamalar); bu, gelecekte yeniden değerlendirilebilecek bir madde değil, kapanmış bir karardır.
