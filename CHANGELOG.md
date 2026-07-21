# Changelog

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

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
