# Changelog

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

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
