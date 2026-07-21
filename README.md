# GötürBeni

Türkiye'de şehirler arası masraf paylaşımı esaslı yolculuk platformu (BlaBlaCar benzeri). Kullanıcılar araç ilanı verip yolculuk masrafını paylaşabilir, ilan arayabilir ve kendi ilanlarını yönetebilir.

**v0.6.0 — Faz 0 – Faz 6 kod tabanı tamamlandı.** ⚠️ **Live Supabase verification pending**: Faz 5/6 migration'ları (`0004_messages.sql`, `0005_reviews.sql`) henüz gerçek bir Supabase projesine uygulanmadı ve gerçek hesaplarla uçtan uca doğrulanmadı — yalnızca yerel `lint`/`tsc`/`build` doğrulaması yapıldı. Bu doküman production hazırlığını ve mevcut sınırları anlatır. Ayrıntılı durum raporu için [PROJECT_STATUS.md](./PROJECT_STATUS.md), sürüm geçmişi için [CHANGELOG.md](./CHANGELOG.md) dosyalarına bakın.

## Proje Amacı

Şehirler arası araçla seyahat eden sürücülerin boş koltuklarını, masraf paylaşımı esasıyla (ticari taşımacılık değil) ilan edebildiği; yolcuların da bu ilanları arayıp rezervasyon talebi oluşturabildiği bir platform. Faz 4 sonunda uygulama, ilan yayınlama, arama/filtreleme ve koltuk rezervasyonunun (talep → onay/red → iptal) uçtan uca çalıştığı bir MVP durumundadır.

## Özellikler

- **Kimlik doğrulama**: E-posta/şifre ile kayıt ve giriş (Supabase Auth), e-posta onay linki akışı, çıkış yapma.
- **Profil yönetimi**: Ad, telefon, biyografi düzenleme; Supabase Storage üzerinden avatar yükleme (kullanıcı başına izole klasör).
- **İlan sistemi**: İlan oluşturma/düzenleme/iptal etme, 81 il arasından kalkış/varış seçimi, tarih/saat/koltuk/masraf payı/açıklama alanları.
- **Arama ve filtreleme**: `/` ve `/rides` üzerinde kalkış/varış/tarih filtresi + tarih/masraf payına göre artan/azalan sıralama, filtreler URL search params'a yazılır (paylaşılabilir/yenilenebilir).
- **İlan detay sayfası**: `/rides/[id]` — sürücü bilgisi (ad, avatar, bio), yolculuk detayları, SEO metadata; misafir de görüntüleyebilir.
- **Rezervasyon sistemi**: Yolcu bir ilana koltuk talebi oluşturur (`pending`), sürücü onaylar/reddeder; onayda `available_seats` atomik olarak düşer (race-condition-safe, bkz. RLS Yapısı), iptalde geri iade edilir. `/bookings` ("Benim Rezervasyonlarım") ve `/rides/[id]/bookings` (sürücü onay paneli).
- **İlan keşfi**: Herkese açık `/rides` listesi (kart görünümü — kalkış, varış, tarih, saat, boş koltuk, masraf payı, durum, sürücü adı ve avatarı), `/rides/mine` altında sürücünün kendi ilan paneli.
- **Durum yönetimi**: İlan için Aktif / Dolu / Tamamlandı / İptal, rezervasyon için Beklemede / Onaylandı / Reddedildi / İptal Edildi rozetleri.
- **Mesajlaşma**: Sürücü ile onaylanmış rezervasyonu olan yolcu arasında 1:1 sohbet (`/rides/[id]/chat`), Supabase Realtime ile anlık mesaj/okundu bilgisi, ephemeral broadcast ile "yazıyor..." göstergesi. Bir ilanda birden fazla onaylanmış yolcu varsa sürücü hangi yolcuyla konuşacağını seçer.
- **Değerlendirme (review)**: Yolculuğun kalkış zamanı geçmiş, onaylanmış bir rezervasyon üzerinden sürücü ve yolcu birbirini 1-5 yıldız + opsiyonel yorumla değerlendirebilir (yolculuk başına bir kez). Profil sayfasında ortalama puan/toplam yorum/toplam yolculuk, ilan detay sayfasında sürücünün ortalama puanı ve son yorumları gösterilir.
- **Çok dilli ve RTL**: Türkçe / Arapça arayüz, cookie tabanlı locale seçimi, tam RTL desteği (yön ikonları dahil).
- **Tema**: Açık/koyu mod (next-themes).
- **Misafir modu**: Supabase kimlik bilgileri boşken bile herkese açık sayfalar (`/`, `/rides`, `/rides/[id]`) çalışır; korumalı sayfalar `/login`'e yönlendirir.

## Teknoloji Stack

- **Next.js 15** (App Router, TypeScript strict, `src/` dizini, Turbopack)
- **TailwindCSS v4** + **shadcn/ui** (`base-nova` stili, RTL destekli, `@base-ui/react` primitifleri)
- **Supabase**: Auth, Postgres Database, Storage — `@supabase/ssr` ile
- **next-intl**: Türkçe / Arapça, cookie tabanlı locale, tam RTL desteği
- **Doğrulama**: Server Actions + Zod (auth/profil formları); **react-hook-form + Zod** (ilan formu)
- **ESLint + Prettier**

## Mimari

- **Feature-based mimari**: `src/features/<domain>/` altında her domain kendi `schemas.ts` (Zod), `actions.ts` (Server Actions), `queries.ts` (okuma) ve bileşenlerini barındırır. `src/app/` yalnızca routing + sayfa kompozisyonu içerir, iş mantığı içermez.
- **Supabase erişim katmanı** (`src/lib/supabase/`):
  - `server.ts` — Server Components/Actions/Route Handler'lar için, her istekte yeni client, kullanıcının oturumuna göre RLS uygular.
  - `dal.ts` — `getCurrentUser()` (misafir-güvenli, null döner) ve `verifySession()` (girişsizse `/login`'e redirect); korumalı sayfaların tek doğrulama noktası, `server-only` ile client bundle'a sızması engellenir.
  - `is-configured.ts` — Supabase env değişkenleri boşken bile middleware ve sayfaların çökmemesini sağlayan guard.
- **Çift katmanlı yetkilendirme**: `middleware.ts` ucuz, cookie tabanlı bir ön kontrol yapar (asıl güvenlik sınırı değildir); her korumalı sayfa ayrıca sunucu tarafında `verifySession()` çağırır. Veritabanı seviyesinde de RLS politikaları aynı sahiplik kuralını tekrar uygular (bkz. "RLS Yapısı") — üç katman da bağımsız olarak sahiplik kontrolü yapar.
- **Server Actions + Zod**: Tüm yazma işlemleri (`actions.ts`) sunucu tarafında Zod ile doğrulanır; formlar `useActionState` (auth/profil) veya `react-hook-form` + zod resolver (ilan formu) kullanır. Veritabanı `check` kısıtlamaları, Zod doğrulamasının bir savunma-derinliği yedeği olarak şemada da tekrarlanır (bkz. migration dosyalarındaki yorumlar).
- **i18n**: `next-intl`, cookie tabanlı locale (`src/i18n/`), `messages/tr.json` ve `messages/ar.json` (anahtar sayısı birebir eşleşir).

## Klasör Yapısı

```
src/
  app/
    (auth)/                  # login, register, verify-email + ortak AuthLayout
    auth/callback/            # Supabase e-posta onay linki callback'i
    profile/                  # korumalı profil sayfası
    rides/                    # herkese açık ilan listesi (arama/filtre/sıralama)
    rides/mine/                 # korumalı: "Benim İlanlarım"
    rides/[id]/                  # herkese açık: ilan detay + rezervasyon butonu
    rides/[id]/edit/             # korumalı: ilan düzenleme
    rides/[id]/bookings/          # korumalı: sürücünün rezervasyon onay paneli
    rides/[id]/chat/              # korumalı: sürücü/yolcu 1:1 sohbet
    create-ride/                 # korumalı: ilan oluşturma
    bookings/                    # korumalı: "Benim Rezervasyonlarım"
  components/
    layout/                   # Header, Footer, LocaleSwitcher, ThemeToggle
    ui/                       # shadcn bileşenleri
    EmptyState.tsx             # paylaşılan boş durum bileşeni
  features/
    auth/                     # schemas.ts, actions.ts, LoginForm, SignUpForm
    profile/                  # schemas.ts, actions.ts, queries.ts, ProfileForm
    rides/                    # schemas.ts, actions.ts, queries.ts, filters.ts, RideForm, RideCard, RideFilters, RideStatusBadge, CancelRideButton
    bookings/                 # schemas.ts, actions.ts, queries.ts, BookingButton, BookingActions, BookingStatusBadge, CancelBookingButton
    chat/                     # schemas.ts, actions.ts, queries.ts, ChatWindow, MessageBubble, MessageInput, PassengerPicker
    reviews/                  # schemas.ts, actions.ts, queries.ts, ReviewForm, ReviewButton, ReviewCard, ReviewSection, StarRating(Input)
  lib/
    supabase/                 # server.ts (Server Components/Actions), client.ts (tarayıcı — yalnızca Realtime için), dal.ts, is-configured.ts
    zod-error.ts               # paylaşılan zod hata mesajı yardımcı fonksiyonu
  i18n/                       # locale-config.ts, locale.ts, request.ts
  types/                      # profile.ts, ride.ts, booking.ts, message.ts, review.ts
  utils/                      # turkish-provinces.ts (81 il), currency.ts
  middleware.ts               # Supabase session refresh + korumalı rota kontrolü
messages/                      # tr.json, ar.json
supabase/
  migrations/
    0001_profiles.sql           # profiles tablosu, RLS, avatars bucket
    0002_rides.sql               # rides tablosu, RLS
    0003_bookings.sql            # bookings tablosu, RLS, approve/reject/cancel RPC fonksiyonları
    0004_messages.sql            # messages tablosu, RLS, Realtime publication
    0005_reviews.sql             # reviews tablosu, RLS (RPC yok)
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
| `SUPABASE_URL` | Aynı proje URL'i (goturbeni.md şablonuyla uyumluluk için) |
| `SUPABASE_ANON_KEY` | Aynı anon key (goturbeni.md şablonuyla uyumluluk için) |

Uygulama kodu yalnızca `NEXT_PUBLIC_*` değişkenlerini okur (`src/lib/supabase/*`); `SUPABASE_URL`/`SUPABASE_ANON_KEY` goturbeni.md'nin env şablonuyla birebir uyum için `.env.example`'da tutulur. **`service_role` anahtarı hiçbir yerde kullanılmaz ve bu projede gerekmez** — tüm sunucu tarafı erişim, oturum sahibinin RLS'e tabi anon/authenticated bağlamıyla yapılır.

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
6. **Storage**: `avatars` bucket'ı ve politikaları migration ile otomatik oluşturulur (aşağıya bakın), manuel kurulum gerekmez.

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

## RLS Yapısı

Her iki tabloda da RLS etkin; politikalar "herkes okuyabilir, yalnızca sahibi yazabilir" prensibini uygular ve uygulama katmanındaki sahiplik kontrolünü veritabanı seviyesinde tekrarlar (savunma derinliği):

| Tablo | Policy | Kural |
|---|---|---|
| `profiles` | `select all profiles` | Herkes (anon dahil) okuyabilir |
| `profiles` | `update own profile` | Yalnızca `auth.uid() = id` |
| `rides` | `select all rides` | Herkes (anon dahil) okuyabilir |
| `rides` | `insert own ride` | Yalnızca giriş yapmış kullanıcı, yalnızca kendi `driver_id`'siyle |
| `rides` | `update own ride` | Yalnızca sahibi **ve** satırın mevcut durumu `active` ise düzenleyebilir; `with check` durumu sınırlamaz, böylece `active → cancelled` geçişi (iptal) izinlidir |
| `bookings` | `select own or driver bookings` | Yolcu kendi rezervasyonunu (`passenger_id = auth.uid()`), sürücü kendi ilanına gelen rezervasyonları görebilir |
| `bookings` | `insert own booking` | Yalnızca giriş yapmış kullanıcı, yalnızca kendi `passenger_id`'siyle |
| `messages` | `select own messages` | Yalnızca gönderen veya alıcı okuyabilir (Realtime abonelikleri de bu policy'ye tabidir) |
| `messages` | `insert own message` | Yalnızca kendi adına, ve yalnızca ilanın sürücüsüyle onaylanmış rezervasyonu olan yolcu arasında |
| `messages` | `update own received message` | Yalnızca alıcı, yalnızca `read_at`'i ("görüldü") işaretlemek için |
| `reviews` | `select all reviews` | Herkes (anon dahil) okuyabilir — profil/ilan detay sayfalarındaki puan gösterimi için |
| `reviews` | `insert own review` | Yalnızca kendi adına; ilanın kalkış zamanı geçmiş **ve** iki taraf arasında onaylanmış bir rezervasyon varsa (sürücü→yolcu ya da yolcu→sürücü) |

`profiles` ve `rides` için `insert`/`delete` politikası tanımlı değildir: profil satırları yalnızca `handle_new_user()` trigger'ı ile (yeni `auth.users` kaydında, `security definer`) oluşturulur; ilanlar hiçbir zaman silinmez, yalnızca `status = 'cancelled'` olarak güncellenir.

`bookings` için **kasıtlı olarak `update` politikası tanımlı değildir**: status geçişleri (onay/red/iptal) yalnızca `approve_booking`/`reject_booking`/`cancel_booking` adlı `security definer` Postgres fonksiyonları üzerinden yapılabilir (doğrudan bir `.update()` çağrısıyla booking status'u değiştirilemez). Bu fonksiyonlar:

- İlgili `rides` ve `bookings` satırlarını `select ... for update` ile kilitler, böylece aynı ilana eşzamanlı iki onaylama isteği serileşir — son koltuk için çifte onay (race condition) imkansızdır.
- Kendi içlerinde `auth.uid()` ile yetki kontrolü yapar (driver-only onay/red, passenger-only iptal).
- `approve_booking`, `rides.available_seats`'i atomik olarak düşürür (0'a inerse `status = 'full'`); `cancel_booking`, önceden onaylanmış bir rezervasyon iptal edilirse koltuğu iade eder (`full` ise `active`'e döner).

Ayrıca `bookings (ride_id, passenger_id)` üzerinde bir **partial unique index** (`status in ('pending','approved')` koşuluyla) çifte rezervasyonu veritabanı seviyesinde engeller — aynı yolcu aynı ilana aktif ikinci bir talep açamaz, ama reddedilmiş/iptal edilmiş bir talepten sonra tekrar talep edebilir.

`reviews (ride_id, reviewer_id)` üzerinde bir **unique index** vardır: bir kullanıcı aynı yolculuk için yalnızca bir kez yorum yazabilir (bu, bir sürücünün birden fazla onaylanmış yolcusu olsa bile o ilan için toplam bir yorum bırakabileceği anlamına gelir — uygulama tarafı bunu, yorum zaten varsa "already reviewed" rozetini tüm satırlarda göstererek yansıtır). `reviews` için `update`/`delete` politikası **kasıtlı olarak yoktur**: yorumlar gönderildikten sonra değiştirilemez/silinemez.

`reviews.insert own review` politikası — `approve_booking`/`reject_booking`/`cancel_booking`'in aksine — bir `security definer` RPC'ye değil doğrudan RLS `with check` ifadesine dayanır: booking onay akışının aksine burada bir race condition riski yoktur (aynı anda iki yorumun çakışıp veri bütünlüğünü bozacağı bir senaryo yok), bu yüzden düz bir `exists` alt sorgusu yeterlidir.

**"Tamamlandı" nasıl hesaplanıyor?** `rides.status` hiçbir zaman otomatik olarak `'completed'`'e geçmediği için (bkz. Bilinen Sınırlamalar), hem `reviews`'ın RLS `with check`'i hem de `getCompletedRidesCount`/booking sayfalarındaki "yorum yap" görünürlüğü, `rides.departure_time < now()` karşılaştırmasını doğrudan kullanır — ayrı bir zamanlanmış görev veya durum geçişi gerekmez.

## Realtime Mimarisi

Mesajlaşma dışında hiçbir yerde Supabase Realtime kullanılmaz (review'lar tamamen Server Component + normal sorgularla çalışır, bkz. Faz 6 talimatı "Realtime yalnızca chat için kullanılacak").

- **Tarayıcı client'ı** (`src/lib/supabase/client.ts`, `createBrowserClient`): bu projedeki Supabase'e dokunan tek tarayıcı-taraflı kod. Uygulamanın geri kalanı tamamen Server Components/Actions üzerinden çalışır (bkz. Mimari); Realtime abonelikleri (websocket) yalnızca tarayıcıda çalışabildiği için bu istisna gereklidir.
- **Mesaj akışı (`postgres_changes`)**: `ChatWindow` bileşeni, `messages` tablosunda `ride_id` filtresiyle `INSERT`/`UPDATE` event'lerine abone olur. RLS select policy'si Realtime abonelikleri için de geçerlidir — bir sürücünün aynı ilanda birden fazla yolcuyla ayrı sohbeti olsa bile, abonelik yalnızca o kullanıcının gönderen/alıcı olduğu satırları döndürür; istemci tarafında ayrıca aktif konuşmaya (belirli bir karşı taraf) ait olmayan event'ler filtrelenir.
- **"Görüldü" (seen) göstergesi**: kalıcı `read_at` kolonuna dayanır. Karşı tarafın okunmamış mesajları ekrana geldiğinde `markMessagesRead` server action'ı `read_at`'i işaretler; bu güncelleme `UPDATE` event'i olarak gönderenin ekranına da anlık yansır (çift tik).
- **"Yazıyor..." göstergesi**: kalıcı depolama **yok** — Supabase Realtime'ın Broadcast özelliği üzerinden, konuşmaya özel bir kanalda (`typing:{rideId}:{iki kullanıcı id'si sıralı}`) ephemeral bir event olarak gönderilir/dinlenir. Sayfa yenilendiğinde veya karşı taraf 3 saniye yazmayı bıraktığında gösterge otomatik kaybolur.
- **Gönderme akışı** yine bu projedeki tüm yazma işlemleri gibi bir Server Action'dır (`sendMessage`) — Realtime yalnızca *okuma* tarafında (canlı güncelleme) kullanılır, INSERT/UPDATE'ler RLS'e tabi normal Supabase istemcisiyle sunucu tarafında yapılır.

## Storage Yapısı

`avatars` bucket'ı (`public = true`) `0001_profiles.sql` migration'ıyla oluşturulur. Dosya yolu şeması `{user_id}/<dosya>` — klasörün ilk segmenti `auth.uid()` ile eşleşmelidir:

| Policy | Kural |
|---|---|
| `select avatars` | Herkes okuyabilir (bucket zaten public, ama Storage API için ayrıca politika tanımlanır) |
| `insert own avatar` | Yalnızca giriş yapmış kullanıcı, yalnızca kendi klasörüne |
| `update own avatar` | Yalnızca giriş yapmış kullanıcı, yalnızca kendi klasöründe |
| `delete own avatar` | Yalnızca giriş yapmış kullanıcı, yalnızca kendi klasöründe |

## Development

```bash
npm run dev     # geliştirme sunucusu (Turbopack, http://localhost:3000)
npm run lint    # ESLint
```

## Build

```bash
npm run build   # production build (.next/), tüm sayfalar sunucu tarafında dinamik render edilir (ƒ), statik export yoktur
npm run start   # production build'i çalıştırır (önce `npm run build` gerekir)
```

## Production Deploy

### Vercel

Proje Vercel'e deploy edilmeye hazırdır:

1. Repoyu Vercel'e bağlayın.
2. **Environment Variables** bölümüne yukarıdaki dört değişkeni girin (Production + Preview ortamları için).
3. Build komutu `next build`, framework preset `Next.js` olarak otomatik algılanır; ekstra ayar gerekmez.
4. Deploy sonrası, Supabase projesinde **Authentication → URL Configuration** altında:
   - **Site URL**'i Vercel production domain'ine güncelleyin.
   - **Redirect URLs**'e Vercel domain'inizin `/auth/callback` yolunu ekleyin (örn. `https://<proje>.vercel.app/auth/callback`) — aksi halde e-posta onay linki çalışmaz.
5. Preview deploy'lar farklı bir URL kullanıyorsa, o URL'in `/auth/callback` yolunu da Redirect URLs listesine eklemeniz gerekir (aksi halde preview ortamında e-posta onayı başarısız olur).

## Bilinen Sınırlamalar

- **Tamamlandı (`completed`) durumuna otomatik geçiş yok**: bir ilanın kalkış zamanı geçtiğinde durumunu otomatik olarak `completed`'e çeviren bir zamanlanmış görev (cron/scheduled function) yok; bu durum şemada ve rozet olarak destekleniyor ama hiçbir akış onu tetiklemiyor.
- **Şehir arama alanlarında autocomplete yok**: hem ilan formunda hem `/rides` filtrelerinde 81 il düz bir dropdown ile seçiliyor (harita/Mapbox tabanlı autocomplete kapsam dışı bırakıldı).
- **İl isimleri yalnızca Türkçe**: `src/utils/turkish-provinces.ts` Arapça arayüzde de çevrilmiyor (şehir özel adları için beklenen davranış, "GötürBeni" marka adı gibi).
- **Telefon numarası formatı doğrulanmıyor**: `profiles.phone` yalnızca uzunluk sınırlıdır (≤20 karakter), format/ülke kodu doğrulaması yok; `phone_verified` alanı şemada var ama hiçbir doğrulama akışı bağlı değil.
- **`npm audit`**: Next.js'in kendi `node_modules` içinde bulunan eski bir `postcss` sürümünden kaynaklanan orta önem dereceli 2 uyarı var. Önerilen otomatik düzeltme Next.js'i 9.x'e düşürüyor (kabul edilemez bir regresyon), bu yüzden bilinçli olarak dokunulmadı.
- **Push notification yok**: yeni bir mesaj geldiğinde, alıcı `/rides/[id]/chat` sayfasını açık tutmuyorsa anında haberdar olmaz (sekme kapalıyken bildirim yok — kapsam dışı, bkz. KESİN KURALLAR).
- **Bir sürücü, bir ilan için yalnızca bir yorum yazabilir**: `reviews (ride_id, reviewer_id)` unique index'i yolculuk başına tek yorum kuralını harfiyen uygular; birden fazla onaylanmış yolcusu olan bir sürücü bu yolcuların yalnızca birini değerlendirebilir, diğerleri için "yorum yap" seçeneği kalıcı olarak kapanır.
- **Mesajlar düzenlenemez/silinemez**, yorumlar da aynı şekilde immutable'dır — her iki tablo için de kasıtlı olarak `update`/`delete` (review) veya sınırlı `update` (yalnızca `read_at`, message) dışında bir değişiklik yolu yoktur.

Faz 4'ün gerçek bir Supabase projesiyle doğrulama durumu için [PROJECT_STATUS.md](./PROJECT_STATUS.md) dosyasına bakın. **Faz 5/6'nın migration'ları henüz gerçek (uzak) Supabase projesine `db push` ile uygulanmadı ve gerçek hesaplarla uçtan uca doğrulanmadı** — bu doküman yalnızca yerel `lint`/`tsc`/`build` doğrulamasını yansıtır (ayrıntı için PROJECT_STATUS.md).

## Roadmap (yalnızca liste — Faz 7+)

- Push notification
- PWA
- Harita/autocomplete tabanlı şehir seçimi
- Ödeme/komisyon sistemi
- Telefon doğrulama
- Admin paneli / Dashboard / Analytics

Bu liste yalnızca bilgilendirme amaçlıdır; kod tabanı feature freeze durumundadır ve bu maddelerden hiçbiri ayrı bir Faz 7 talimatı verilmeden geliştirilmeyecektir.
