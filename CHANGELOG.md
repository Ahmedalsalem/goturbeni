# Changelog

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

## [Unreleased]

### Bakım

- **Next.js 15.5.20 → 15.5.21** (`npm@10.8.2 install next@15.5.21 --save-exact`, CI'ın kullandığı npm sürümüyle — bkz. daha önceki lockfile drift notları). `npm audit`'in bir önceki denetimde önerdiği "next@15.5.21 kurulumu yeterli" değerlendirmesi **yanlış çıktı**: bu sürüme geçtikten sonra bile `postcss`/`sharp` uyarıları aynen duruyor, `npm audit fix --force` hâlâ tek çözüm olarak `next@9.3.3`'e düşmeyi öneriyor (kabul edilemez). Yükseltme yine de kendi başına faydalı (güncel patch) olduğu için tutuldu, ama `npm audit` sonucu **değişmedi** — bilinen sınırlama olarak kalıyor.

### Eklendi

- **Telefon numarası format doğrulaması**: `profiles_private.phone` artık `libphonenumber-js` ile gerçek bir numara olup olmadığı kontrol ediliyor (uzunluk kontrolüne ek olarak). Ülke kodu belirtilmemişse Türkiye numarası (`TR`) varsayılır; `+` ile başlayan numaralar kendi ülke koduna göre doğrulanır (Arapça yerelindeki kullanıcılar için de doğru çalışır). Yeni test dosyası: `src/features/profile/schemas.test.ts`.

### Düzeltildi

- **Kritik — saat dilimi**: ilan kalkış tarihi/saati, tarayıcı/sunucunun *çalışma zamanı* saat dilimine göre yorumlanıyordu (`new Date("YYYY-MM-DDTHH:MM")`). Yerelde bu Türkiye saatiyle çakıştığı için sorun görünmüyordu, ama production (Vercel, UTC çalışıyor) kullanıcının girdiği saati UTC sayıp **3 saat ileri** kaydediyordu — bu sessizce oluyordu (kullanıcı arayüzde girdiği saati görüyordu) ama "kalkış zamanı geçti mi" kontrolü (yorum hakkının açılması, ilan durumu vb.) gerçekte 3 saat geç tetikleniyordu. Yeni `src/utils/istanbul-time.ts`, tüm tarih/saat oluşturma ve gösterimini açıkça `Europe/Istanbul` (Türkiye 2016'dan beri DST kullanmıyor, sabit UTC+3) olarak sabitliyor — çalışma zamanından bağımsız. `next-intl`'in `timeZone` ayarı da eklendi (tüm `format.dateTime` gösterimleri için). Production'da doğrulandı.
- **Bir sürücü, birden fazla onaylanmış yolcusu olan bir ilanda yalnızca birini değerlendirebiliyordu**: `reviews` tablosundaki `(ride_id, reviewer_id)` unique index'i, kuralı yanlışlıkla "yolculuk başına tek yorum" olarak uyguluyordu — oysa asıl kural (RLS `insert own review` politikasının zaten varsaydığı gibi) "yolculukta aynı kişi için tek yorum" olmalıydı. Index `(ride_id, reviewer_id, reviewed_user_id)`'e genişletildi (`0008_reviews_per_reviewee.sql`); `getMyReviewForRide` artık `revieweeId` parametresi alıyor, `/rides/[id]/bookings` sayfası "yorum yaptın mı" kontrolünü ilan bazında değil yolcu bazında yapıyor.
- **Kritik**: `/rides/mine` üzerinde "Rezervasyonlar" bağlantısı yalnızca `status === "active"` olan ilanlarda gösteriliyordu. Bir ilan tamamen dolduğunda (`status` `"full"`'a döndüğünde) bu bağlantı tamamen kayboluyordu — bu, sürücünün o ilanın rezervasyon yönetimine, dolayısıyla sohbete ve (yolculuk sonrası) değerlendirmeye ulaşabileceği **tek** yoldu. Sonuç: dolu bir ilanda sürücü, onaylı yolcunun gönderdiği mesajları okuyacağı sohbet sayfasına hiçbir şekilde ulaşamıyordu. Düzeltme: "Rezervasyonlar" bağlantısı artık ilan durumundan bağımsız her zaman gösteriliyor; yalnızca "Düzenle" ve "İptal Et" (RLS'in zaten yalnızca `active` ilanlarda izin verdiği işlemler) `active` durumuyla sınırlı kaldı. İki gerçek hesapla (1 koltuklu ilan, doldurulup "full" durumuna getirilerek) doğrulandı.
- **Mobil**: üst menü (Header) dar ekranlarda (~375px) her zaman taşıyordu — hamburger menü, dil seçici, tema butonu, ve "Giriş Yap"/"Kayıt Ol" (veya "Profil") aynı satıra sığdırılmaya çalışılıyordu. Giriş/Kayıt bağlantıları artık `sm` altında hamburger menüsüne taşınıyor, "Profil" butonunun metin etiketi `sm` altında gizleniyor (yalnızca ikon+ok kalıyor, `aria-label` ile erişilebilirlik korunuyor). Tüm herkese açık ve girişli sayfalarda 375px genişlikte yatay taşma olmadığı doğrulandı.
- **Mobil sohbet sayfası**: `ChatWindow`'daki "en alta kaydır" mantığı bir sentinel elemanda `scrollIntoView()` çağırıyordu — bu, yalnızca mesaj listesini değil, kısa mobil ekranlarda **tüm sayfayı** kaydırarak sohbetin kendi üst çubuğunu (karşı tarafın avatarı/adı) sitenin sticky header'ının arkasına itiyordu (`y: -44`, görünmez). Kaydırma artık mesaj container'ının kendi `scrollTop`'unu ayarlıyor (`scroll-smooth` ile animasyonlu) — sayfanın geri kalanına dokunmuyor. Gerçek hesaplarla 375px genişlikte doğrulandı (`y: 110`, görünür).

### Eklendi

- **Okunmamış mesaj rozeti**: push notification altyapısı henüz gerçek bir servise bağlı olmadığından (bkz. Faz 7), bir kullanıcının yeni bir mesaj geldiğini fark etmesinin daha önce hiçbir yolu yoktu — sohbet sayfasına kendi gitmedikçe. Üst menüdeki "Profil" açılır menüsüne (herhangi bir okunmamış mesaj varsa) ve `/bookings` ile `/rides/[id]/bookings` listelerindeki ilgili "Sohbet" bağlantısına (o ilan/yolcu için okunmamışsa) küçük kırmızı bir nokta eklendi. Yeni tablo gerekmedi — mevcut `messages.read_at` alanından türetildi. İki gerçek hesapla canlı doğrulandı: mesaj gönderilmeden önce rozet yok, gönderildikten sonra hem üst menüde hem ilgili satırda görünüyor, sohbet açılıp mesaj okunmuş sayılınca (mevcut `markMessagesRead` akışı) kayboluyor.

## [1.0.0] — Faz 7 (production readiness) — 2026-07-22

✅ **Canlı doğrulama tamamlandı** (2026-07-22) — `0007_profile_update_atomicity.sql` gerçek Supabase projesine (`dvpxvcvmtxsticczlpwg`) `supabase db push` ile uygulandı ve `supabase migration list` ile doğrulandı. İki gerçek hesapla (1 sürücü + 1 yolcu, Playwright ile tarayıcı üzerinden) tam uçtan uca akış doğrulandı: kayıt, giriş, profil güncelleme (telefon dahil — `update_own_profile` RPC'sini gerçek DB'ye karşı çalıştırır), avatar yükleme, ilan oluşturma, arama/filtreleme, rezervasyon talebi, onay, karşılıklı mesajlaşma, (kalkış zamanı geçtikten sonra) karşılıklı değerlendirme, profil puanının güncellenmesi, şifre sıfırlama talebi (yalnızca "bağlantı gönderildi" adımı — gerçek e-posta kutusuna erişim olmadığından bağlantıya tıklanamadı), çıkış. Test sırasında oluşturulan tüm veriler (4 test hesabı + bağlı profil/ilan/rezervasyon/mesaj/yorum satırları) `auth.users`'tan silinerek cascade ile temizlendi ve doğrulandı (0 kalıntı). Ayrıntı için [PROJECT_STATUS.md](./PROJECT_STATUS.md).

⚠️ **Önemli düzeltme**: `0006_profiles_phone_privacy.sql` bu oturumun BAŞINDA zaten canlıya uygulanmış durumdaydı (önceki, bu oturumdan bağımsız bir oturumda) — dosya git'e commit'lenmemiş ama migration ledger'ında kayıtlıydı. Bu, `supabase db push --dry-run`'ın "Remote database is up to date" demesiyle ortaya çıktı. 0006'ya yapılan ilk düzenlemeler (aşağıdaki iki güvenlik maddesi) bu yüzden geri alınıp ayrı bir `0007_profile_update_atomicity.sql` migration'ına taşındı — zaten uygulanmış bir migration dosyasını sonradan düzenlemek `db push`'ın onu asla yeniden çalıştırmaması anlamına gelir.

### Güvenlik

- **Kritik**: `profiles` tablosundaki genel SELECT politikası (`using (true)`, `to` kısıtlaması yok) anon dahil herkesin `phone`/`phone_verified` kolonlarını okuyabilmesine izin veriyordu (RLS satır bazlı olduğu için). `phone`/`phone_verified` artık yalnızca sahibine sınırlı RLS'e sahip ayrı bir `profiles_private` tablosunda (`0006_profiles_phone_privacy.sql`, daha önceki bir oturumda canlıya uygulanmış).
- `0007_profile_update_atomicity.sql`: (1) profil güncellemesinde `profiles` ve `profiles_private` tablolarına yapılan iki ayrı, transactional olmayan yazım (biri başarısız olursa diğerinin sessizce kalıcı olma riski) tek bir `security invoker` Postgres fonksiyonuna (`update_own_profile`) birleştirildi; (2) `profiles_private` üzerindeki "select own phone" politikasına, projenin geri kalanıyla tutarlılık için eksik olan `to authenticated` kısıtlaması eklendi (anon zaten `auth.uid()` null döndüğünden pratikte açık bir açık yoktu).
- `next.config.ts`'e üretim güvenlik başlıkları eklendi: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; `poweredByHeader: false` ile `X-Powered-By` başlığı kaldırıldı.
- `.env.example`'daki hiçbir yerde kullanılmayan (ölü) `SUPABASE_URL`/`SUPABASE_ANON_KEY` girişleri temizlendi.

### Eklendi

- **PWA**: `manifest.ts`, uygulama simgeleri (192/512/maskable + apple-touch-icon), `theme-color`, varsayılan OpenGraph görseli (`opengraph-image.png`). Temel düzeyde offline fallback: `public/sw.js` yalnızca `/offline` sayfasını önbelleğe alıp ağ hatasında gösterir (uygulamanın geri kalanı offline çalışmaz — Supabase'e bağımlı dinamik içerik olduğu için kapsam dışı).
- **Push notification altyapısı** (`src/lib/notifications.ts`): rezervasyon talebi/onay/red ve yeni mesaj olayları için tip güvenli bir soyutlama; şu an no-op, gerçek bir servis (web-push/FCM/OneSignal) seçildiğinde yalnızca fonksiyon gövdesi değişecek.
- **Monitoring hazırlığı**: `src/lib/logger.ts` tüm server action hata yollarına eklendi (önceden Supabase hataları sessizce yutuluyor, yalnızca genel çevrilmiş mesaj kullanıcıya dönüyordu); `src/instrumentation.ts` (Next.js runtime instrumentation hook'u, gelecekte Sentry/OpenTelemetry için hazır); `src/app/global-error.tsx` (root layout'ta oluşan hataları da yakalar, `error.tsx` bunu kapsamıyordu).
- **SEO**: `metadataBase`, site geneli ve `/rides/[id]`'e özel OpenGraph etiketleri, `/rides` ve `/rides/[id]` için canonical URL (`/rides` filtre query param'larının ayrı sayfalar olarak indekslenmesini önler).
- **Erişilebilirlik**: `RideForm` ve `ReviewForm`'daki (client-side doğrulama hatası gösteren tek iki form) tüm alanlara `aria-invalid`/`aria-describedby` bağlandı — `FieldError` zaten `role="alert"` render ediyordu ama ekran okuyucular hatayı ilgili alanla ilişkilendiremiyordu.

### Performans

- `getCurrentUser()`, `getProfile()`, `getRideWithDriver()` React `cache()` ile sarıldı — `/rides/[id]` sayfası bu üçünü aynı istek içinde birden fazla kez çağırıyordu (örn. `generateMetadata` + sayfa gövdesi), artık istek başına tek Supabase round-trip'i.

### Bilinçli olarak yapılmayan

- hreflang/alternates: uygulama tek URL + cookie tabanlı locale kullanıyor (yol tabanlı `/tr`, `/ar` değil), bu yüzden Google'ın hreflang modeli doğrudan uygulanamıyor — bu mimariyi değiştirmek yeni bir routing/URL yapısı gerektirir, kapsam dışı bırakıldı.
- Avatarlar için `next/image`'e geçiş: tek görsel kullanım noktası (Base UI `Avatar.Image`), küçük boyut, düşük risk/getiri oranı nedeniyle değerlendirilip ertelendi — davranış değişikliği riski taşıyordu.

## [0.6.0]

⚠️ **Live Supabase verification pending** — bu sürümdeki migration'lar (`0004_messages.sql`, `0005_reviews.sql`) henüz gerçek bir Supabase projesine uygulanmadı ve gerçek hesaplarla uçtan uca doğrulanmadı. Doğrulama yalnızca yerel `npm run lint` / `npx tsc --noEmit` / `npm run build` ile yapıldı (üçü de temiz). Ayrıntı için [PROJECT_STATUS.md](./PROJECT_STATUS.md).

### Eklendi

- **Faz 5 — Mesajlaşma**: `messages` tablosu + RLS (`0004_messages.sql`), `supabase_realtime` publication'ına eklendi. Sürücü ile onaylanmış rezervasyonu olan yolcu arasında `/rides/[id]/chat` üzerinden 1:1 sohbet; Supabase Realtime (`postgres_changes`) ile anlık mesaj teslimi ve okundu (`read_at`) bilgisi, ephemeral Broadcast kanalıyla "yazıyor..." göstergesi. Bir ilanda birden fazla onaylanmış yolcu varsa sürücü hangi yolcuyla konuşacağını seçer (`PassengerPicker`).
- **Faz 6 — Değerlendirme (review)**: `reviews` tablosu + RLS (`0005_reviews.sql`, RPC kullanılmadı — race condition riski olmadığından düz RLS `with check` yeterli). Yolculuğun kalkış zamanı geçmiş, onaylanmış bir rezervasyon üzerinden sürücü ve yolcu birbirini 1-5 yıldız + opsiyonel yorumla değerlendirebilir (`ride_id, reviewer_id` üzerinde unique index — yolculuk başına bir yorum). Profil sayfasında ortalama puan/toplam yorum/toplam yolculuk, ilan detay sayfasında sürücünün ortalama puanı ve son yorumları.
- Yeni tarayıcı Supabase client'ı (`src/lib/supabase/client.ts`, `createBrowserClient`) — yalnızca Realtime abonelikleri için, uygulamanın geri kalanı Server Components/Actions üzerinden çalışmaya devam ediyor.

### Bakım

- Kendi kendine yapılan denetimde bulunup düzeltilen sorunlar: `ReviewForm`'daki bir TypeScript tip uyuşmazlığı (zod `coerce.number()` alanı için `Controller`'ın `field.value`'su), sürücü rezervasyon panelinde "yorum yaptınız mı" kontrolünün yanlışlıkla yolcu bazında hesaplanması (doğrusu ilan bazında — `reviews` unique index'i `(ride_id, reviewer_id)`), mesaj yazma alanında eksik `aria-label`, "görüldü/gönderildi" durumunun yalnızca ikonla (ekran okuyucusuz) iletilmesi, yıldız puanlama girişinde uygulanmamış klavye ok-tuşu gezinmesini ima eden yanlış `radiogroup`/`radio` ARIA rolleri.
- **v1.0.0 production hazırlığı denetiminde (bu oturum) bulunup düzeltilen a11y sorunları**: sayfa geneline `#main-content` hedefli bir "içeriğe geç" atlama bağlantısı eklendi (`src/app/layout.tsx`); `/rides/[id]` sayfasında eksik olan `<h1>` eklendi (rota başlığı artık düz `div` değil `<h1>`); `RideFilters`, `RideForm` ve `ProfileForm` içindeki 6 `<Select>` tetikleyicisinde eksik erişilebilir isim (`aria-label`) giderildi.

## [0.4.1]

### Değiştirildi

- **UI/UX yenileme**: Tüm arayüz premium/minimal bir tasarım diline geçirildi — mavi tek-vurgu renk paleti (`#2563EB`), yumuşatılmış radius/gölge/border değerleri, yenilenmiş navbar (sticky + blur, "Nasıl Çalışır"/"Destek" sayfaları, giriş yapmış kullanıcı için Profil dropdown'u altında toplanan Benim İlanlarım/Rezervasyonlarım), gradyanlı ve Framer Motion ile aşamalı (stagger) canlanan hero + floating arama kartı, premium buton/kart/rozet stilleri (durum rozetleri artık başarı/uyarı renkleriyle), hover'da yükselen ilan kartları. Mevcut işlevsellik değişmedi (gerçek Supabase akışıyla uçtan uca tekrar doğrulandı); yalnızca görsel katman güncellendi. Yeni bağımlılık: `framer-motion`.

## [0.4.0]

### Eklendi

- **Faz 3 — Arama, Filtreleme, İlan Detay**: `/` ve `/rides` üzerinde kalkış/varış/tarih filtresi (URL search params'a yazılır, sayfa yenilenince korunur), tarih/masraf payına göre artan/azalan sıralama; `/rides/[id]` herkese açık ilan detay sayfası (sürücü bilgisi, bio, yolculuk detayları, SEO metadata).
- **Faz 4 — Rezervasyon Sistemi**: `bookings` tablosu + RLS (`0003_bookings.sql`), yolcu koltuk talebi oluşturma (`pending`), sürücü onay/red paneli (`/rides/[id]/bookings`), yolcunun kendi rezervasyonları (`/bookings`), rezervasyon durum rozetleri (Beklemede/Onaylandı/Reddedildi/İptal Edildi). Onay/red/iptal yalnızca `security definer` Postgres fonksiyonları (`approve_booking`, `reject_booking`, `cancel_booking`) üzerinden yapılır; bu fonksiyonlar ilgili satırları `for update` ile kilitleyerek son koltuk için çifte onayı (race condition) engeller, ayrıca `(ride_id, passenger_id)` üzerinde bir partial unique index çifte rezervasyonu veritabanı seviyesinde engeller.

## [0.2.0]

### Eklendi

- **Faz 1 — Authentication**: Supabase Auth (kayıt/giriş/çıkış), e-posta onay callback'i (`/auth/callback`), `/profile` korumalı rota (middleware + `verifySession()` çift katmanlı doğrulama), `profiles` tablosu + RLS + `auth.users`'a bağlı otomatik profil oluşturma trigger'ı, profil güncelleme formu, avatar upload (Supabase Storage, kullanıcı başına izole klasör).
- **Faz 2 — İlan Sistemi**: `rides` tablosu + RLS (herkes okuyabilir, yalnızca sahibi düzenleyebilir/iptal edebilir), ilan oluşturma/düzenleme (react-hook-form + Zod), ilan iptali, 81 il dropdown, `/rides` herkese açık ilan listesi, `/rides/mine` sürücü paneli, durum rozetleri (Aktif/Dolu/Tamamlandı/İptal).

### Bakım

- Production hazırlık denetimi: ESLint/TypeScript/build doğrulaması, kullanılmayan kod temizliği (`src/lib/supabase/client.ts`, `initialRideActionState`, varsayılan `create-next-app` SVG'leri), README/PROJECT_STATUS dokümantasyonu.

## [0.1.0]

### Eklendi

- **Faz 0 — Kurulum**: Proje iskeleti, `src/` tabanlı Feature-Based Architecture, App Router layout (Header/Footer/ThemeProvider), next-intl ile Türkçe/Arapça + tam RTL desteği, dark mode, Supabase client/server/DAL bağlantı altyapısı (misafir-güvenli), placeholder sayfalar, responsive tasarım.
