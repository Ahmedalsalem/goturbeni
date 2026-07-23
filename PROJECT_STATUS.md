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
| Faz 5 | 🟡 Kod tamamlandı, canlı doğrulama bekliyor | `messages` tablosu + RLS + Realtime publication (`0004_messages.sql`), `/rides/[id]/chat` 1:1 sohbet (Supabase Realtime: mesaj + okundu bilgisi; Broadcast: yazıyor göstergesi) |
| Faz 6 | 🟡 Kod tamamlandı, canlı doğrulama bekliyor | `reviews` tablosu + RLS (RPC yok) (`0005_reviews.sql`), tamamlanmış rezervasyon üzerinden karşılıklı 1-5 yıldız + yorum, profil/ilan detay sayfalarında puan gösterimi |
| Faz 7 | ✅ Kod + canlı doğrulama tamamlandı, sürüm/tag bekliyor | Production readiness: güvenlik (phone privacy + atomicity fix, `0007_profile_update_atomicity.sql` canlıya uygulandı), deployment hardening (security headers), PWA (manifest + ikonlar + temel offline fallback), push notification altyapısı (soyutlama, gerçek servis yok), monitoring hazırlığı (logger + instrumentation hook + global-error), SEO (metadataBase + OG + canonical), erişilebilirlik (form aria wiring), performans (React cache() dedup) |
| Faz 8 | 🟡 Kod tamamlandı, migration push + canlı doğrulama bekliyor | Faz 7'nin "Bilinen Sınırlamalar" listesindeki 4 madde: ilan durumunun kalkış saati geçince otomatik `completed`'e geçmesi (pg_cron, `0011_ride_auto_complete.sql`), Arapça arayüzde 81 il için gerçek Arapça görünen ad (`turkish-provinces-ar.ts`), gerçek SMS/OTP telefon doğrulaması (Supabase Auth `phone_change` akışı + senkron trigger, `0010_phone_verification.sql`), push notification'ın Web Push/VAPID'e bağlanması (`0012_push_subscriptions.sql`). Şehir seçiminde autocomplete zaten bu fazdan önce (`38065d3`) tamamlanmıştı, README güncel değildi — bu oturumda düzeltildi. |

## Faz 8 — Faz 7 Bilinen Sınırlamaları (bu oturum)

Kapsam: kullanıcının talep ettiği 6 maddelik listeden 4'ü (otomatik tamamlanma, AR il adları, SMS/OTP, push notification) — biri (şehir autocomplete) zaten kod tabanında tamamlanmıştı, biri (mesaj/yorum düzenlenemez) kasıtlı tasarım olduğu için dokunulmadı.

- **Otomatik tamamlanma**: `0011_ride_auto_complete.sql`, `pg_cron` extension'ını açar ve her dakika çalışan `security definer` bir fonksiyonla `departure_time`'ı geçmiş `active`/`full` ilanları `completed`'e çevirir. `reviews`/booking sayfalarındaki "tamamlandı" kontrolü bilinçli olarak `departure_time < now()` karşılaştırmasını korudu (cron'un dakikalık gecikmesini beklemeden anlık doğruluk için) — bkz. README → "Tamamlandı nasıl hesaplanıyor?".
- **AR il adları**: `src/utils/turkish-provinces-ar.ts`, 81 il için Arapça Wikipedia'dan doğrulanmış görünen adlar içerir (birkaç ilk taslak hatası — Kahramanmaraş, Afyonkarahisar, Mersin, Aydın — bağımsız sayfa sorgularıyla düzeltildi). Veritabanı değeri (`rides.departure_city`/`arrival_city`) Türkçe kalır; yalnızca AR locale'de gösterilen etiket çevrilir (RideCard, ilan detay, `/bookings`, RideForm/RideFilters Combobox'ları — hem liste öğesi hem seçili değerin input'ta göründüğü metin, Base UI'nin `itemToStringLabel` prop'u ile).
- **SMS/OTP telefon doğrulama**: `0010_phone_verification.sql`, `auth.users.phone_confirmed_at`'i dinleyen bir trigger ile `profiles_private.phone_verified`'ı otomatik senkronize eder (uygulama kodu bunu asla doğrudan yazmaz) ve `update_own_profile`'ı, telefon numarası elle değiştiğinde `phone_verified`'ı sıfırlayacak şekilde günceller. `src/features/profile/actions.ts` → `sendPhoneVerificationCode`/`verifyPhoneVerificationCode`, Supabase Auth'un `phone_change` OTP akışını kullanır. **Gerçekten SMS gönderebilmesi için Supabase projesinde bir sağlayıcı (Twilio vb.) yapılandırılmalı** — bu adım kod kapsamı dışında, bkz. README → Bilinen Sınırlamalar.
- **Push notification**: `0012_push_subscriptions.sql`, `push_subscriptions` tablosu (owner-only RLS) ve karşı tarafın aboneliklerini dar kapsamlı okuyan/silen iki `security definer` RPC ekler (yalnızca gerçek bir ilan/rezervasyon ilişkisi olan karşı taraf için — bookings.sql'deki approve/reject/cancel_booking ile aynı yetkilendirme deseni). `src/lib/notifications.ts`, `web-push` kütüphanesiyle gerçek gönderim yapar (VAPID, ücretsiz — bu oturumda yeni bir keypair üretilip `.env.local`'e yazıldı). `public/sw.js`'e `push`/`notificationclick` event handler'ları eklendi; Header'a bir bildirim aç/kapat butonu (`PushNotificationToggle`) eklendi.

Doğrulama (bu oturumda): `npm run lint` (temiz), `npx tsc --noEmit` (temiz), `npm test` (91/91 geçti), `npm run build` (28 rota, başarılı), i18n anahtar eşleşmesi (tr/ar, 377/377 birebir).

**Bu oturumda YAPILMAYAN**: `0010`/`0011`/`0012` migration'ları henüz `supabase db push` ile gerçek (linked) Supabase projesine uygulanmadı; gerçek hesaplarla uçtan uca canlı doğrulama (SMS sağlayıcısı bağlı değilken OTP gönderilemeyeceği için telefon doğrulama akışı yalnızca kod/tip seviyesinde doğrulanabildi) yapılmadı. Bunlar kullanıcının onayından sonra yapılmalı.

## Faz 7 — Production Readiness (önceki oturum)

Kapsam: yeni özellik yok, yalnızca production'a hazırlık. Ayrıntılı liste için [CHANGELOG.md → \[Unreleased\] — Faz 7](./CHANGELOG.md). Özet:

- **Güvenlik**: Bu oturuma girişte zaten yarım kalmış bir düzeltme mevcuttu — `profiles` tablosundaki genel SELECT politikası anon dahil herkesin telefon numarasını okuyabilmesine izin veriyordu; `profiles_private` tablosuna taşıma migration'ı (`0006`) yazılmıştı. Migration dosyasını düzenleyip `db push` denedikten sonra ortaya çıktı ki **`0006` bu oturumdan bağımsız, önceki bir oturumda zaten canlıya uygulanmıştı** (dosya commit'lenmemiş ama migration ledger'ında kayıtlıydı — `db push --dry-run` "up to date" dedi). 0006'ya yapılan düzenlemeler geri alınıp yeni bir `0007_profile_update_atomicity.sql`'e taşındı: (1) `updateProfile`'daki iki ayrı, transactional olmayan yazımı (`profiles` + `profiles_private`) tek bir `security invoker` RPC'ye (`update_own_profile`) birleştirdi, (2) `select own phone` politikasına eksik olan `to authenticated` eklendi. Bu migration gerçek projeye uygulandı ve doğrulandı. Tüm RLS politikaları, `security definer` fonksiyonların `search_path` hijyeni, `service_role`/secret kullanımı ve server action yetkilendirmesi bağımsız olarak tekrar denetlendi — hepsi temiz bulundu.
- **PWA, push notification altyapısı, monitoring hazırlığı, SEO, erişilebilirlik, performans**: bkz. CHANGELOG.

Doğrulama: `npm run lint` (temiz), `npx tsc --noEmit` (temiz), `npm run build` (28 rota, başarılı), `npm test` (71/71 geçti — `bookings/actions.test.ts`'teki 3 test, yeni eklenen `getBookingPassengerId` çağrısı için mock zinciri eksik olduğundan önce kırıldı, mock'lar güncellenerek düzeltildi).

### Canlı doğrulama (bu oturum, kullanıcı onayıyla)

`0007_profile_update_atomicity.sql`, `supabase db push` ile gerçek projeye (`dvpxvcvmtxsticczlpwg`) uygulandı ve `supabase migration list` ile doğrulandı.

İki gerçek hesapla (1 sürücü + 1 yolcu, Playwright ile headless Chromium üzerinden, `http://localhost:3001`'de gerçek `.env.local` kimlik bilgileriyle çalışan `npm run dev`'e karşı) uçtan uca doğrulanan akış:

- Kayıt (her iki hesap) — Supabase projesinde "Confirm email" kapalı olduğu doğrulandı (kayıt sonrası doğrudan `/profile`'a düşüyor).
- Sürücü profil güncellemesi: ad soyad, telefon, avatar yükleme — sayfa yenilendikten sonra üçünün de kalıcı olduğu doğrulandı. **Bu adım `update_own_profile` RPC'sini (bu oturumun güvenlik düzeltmesi) gerçek veritabanına karşı çalıştırdı ve doğruladı.**
- İlan oluşturma (Ankara → İstanbul, kalkış +3 dakika ileri, 1 koltuk, ₺100).
- Yolcu tarafında `/rides` üzerinde kalkış/varış filtresiyle arama — ilan bulundu.
- Rezervasyon talebi → sürücü panelinden onay (koltuk sayısı ve rozet güncellendi).
- `/rides/[id]/chat` üzerinden karşılıklı mesajlaşma (Realtime; ikinci tarayıcı bağlamında mesajın göründüğü doğrulandı).
- Kalkış zamanı geçtikten sonra (gerçek ~5 saniyelik bekleme) karşılıklı değerlendirme: yolcu sürücüyü 5 yıldız, sürücü yolcuyu 4 yıldız ile değerlendirdi.
- Her iki profilde de puan/yorumun doğru göründüğü ekran görüntüsüyle doğrulandı (`Toplam 1 yolculuk`, `5.0 · 1 yorum`).
- Şifre sıfırlama: yalnızca "bağlantı gönderildi" adımı doğrulandı — `@example.com` test hesaplarının gerçek bir gelen kutusu olmadığından e-postadaki bağlantıya tıklanıp yeni şifre belirleme adımı test edilemedi.
- Giriş (ayrı bir oturumda, kayıttan bağımsız) ve çıkış (dropdown → "Çıkış Yap" → ana sayfaya yönlendirme ve "Giriş Yap" butonunun geri gelmesi) doğrulandı.

Test sırasında oluşturulan tüm veriler temizlendi: `auth.users`'tan `email like 'gb-test-%@example.com'` deseniyle 4 hesap silindi (cascade ile bağlı `profiles`/`profiles_private`/`rides`/`bookings`/`messages`/`reviews` satırları da silindi); silme sonrası `auth_users=0`, `orphan_profiles=0`, `leftover_test_rides=0` sorgusuyla doğrulandı.

**Not**: Bu, `auth.users`'a doğrudan SQL erişimiyle yapılan ilk tam temizlik — önceki bir oturumda (Faz 3+4 doğrulaması) `auth.users`'a erişim olmadığı için ~12 "kabuk" test profili temizlenememişti (bkz. aşağıdaki "Faz 3 + Faz 4 Gerçek Supabase Doğrulaması"). Bu oturumda edinilen `supabase db query --linked` erişimiyle bu eski kalıntılar da temizlenebilir — istenirse ayrıca yapılabilir, bu oturumda dokunulmadı (kapsam dışı).

**Bu oturumda hâlâ YAPILMAYAN**:

- `package.json` sürümü ve `CHANGELOG.md`'deki `[Unreleased]` bölümünün `1.0.0`'a taşınması, git tag önerisi — Faz 7 brifingi bunu ayrı bir onay adımına bağlıyor.

## Faz 5 + Faz 6 — Mevcut Durum (bu oturum)

Kod, aşağıdaki yerel kontrollerle doğrulandı:

- `npm run lint` → temiz.
- `npx tsc --noEmit` → temiz (bir tip hatası bulundu — `ReviewForm.tsx`'te `Controller`'ın `field.value`'su zod `coerce.number()` girişinde `unknown` tipinde geliyordu — `as number` ile düzeltildi).
- `npm run build` → başarılı, `/rides/[id]/chat` dahil 17 rota derlendi.

Ayrıca yazım sırasında bulunup düzeltilen bir mantık hatası: sürücünün rezervasyon panelinde (`/rides/[id]/bookings`) "yorum yaptınız mı" kontrolü ilk yazımda yolcu bazında hesaplanmıştı; ancak `reviews` tablosunda unique index `(ride_id, reviewer_id)` olduğu için bir sürücü bir ilan için toplamda yalnızca **bir** yorum yazabilir (belirli bir yolcu için değil). Kontrol, ilan bazında tek bir `getMyReviewForRide` sorgusuna düzeltildi ve bulgu README → Bilinen Sınırlamalar'a not edildi.

**Bu oturumda YAPILMAYAN (kullanıcının açık talebiyle ertelendi):**

- `0004_messages.sql` ve `0005_reviews.sql` migration'ları henüz gerçek (uzak) Supabase projesine `supabase db push` ile uygulanmadı.
- Gerçek iki hesapla (1 sürücü + 1 yolcu) uçtan uca doğrulama (rezervasyon → chat → completed → review → profil puanı) yapılmadı.
- Kullanıcı, canlı Supabase'e dokunulmadan önce kodu incelemek istediğini belirtti; bu adımlar onun onayından sonra yapılacak.

**Bu nedenle GötürBeni v0.6.0 için henüz gerçek Supabase doğrulaması yoktur** — yalnızca statik/yerel doğrulama tamamlanmıştır. `package.json` sürümü, kullanıcının açık talimatıyla (kod tabanı commit'lendikten sonra) `0.6.0`'a güncellendi; bu, canlı doğrulamanın da tamamlandığı anlamına **gelmez** — bkz. "⚠️ Live Supabase verification pending" notu yukarıda.

### Git

Bu oturumda, kullanıcının açık talimatıyla kod tabanı commit'lendi: `git add .` → `git commit -m "Complete GötürBeni v0.6.0 (Phase 5 & Phase 6 implementation)"` (commit `39eda08`, 121 dosya). Bu, projenin git geçmişindeki **ikinci commit**; ilk commit yalnızca `create-next-app`'in ürettiği iskeletti — Faz 0'dan bu yana yapılan tüm iş (bu oturuma kadar) hiç commit'lenmemişti. `git push` **yapılmadı**: `git remote -v` boş döndü, yani `origin` diye bir remote tanımlı değil; ayrıca yerel branch adı `master`, talimattaki `git push origin main` komutu zaten çalışmayacaktı (o isimde yerel bir branch yok). Uzak depo eklenip push istenirse ayrıca belirtilmesi gerekir.

## Faz 3 + Faz 4 Gerçek Supabase Doğrulaması (bu oturum)

Migration `0003_bookings.sql`, kullanıcı onayıyla gerçek (linked) Supabase projesine `supabase db push` ile uygulandı ve `supabase migration list` ile uzak projede kayıtlı olduğu doğrulandı.

Üç gerçek test hesabıyla (1 sürücü + 2 yolcu, Playwright ile tarayıcı üzerinden) uçtan uca doğrulanan akış:

- Sürücü kayıt olup ilan oluşturdu (Ankara → İstanbul, 1 koltuk, ₺250).
- Misafir kullanıcı `/rides` üzerinde kalkış/varış/tarih filtresiyle ilanı buldu; `/rides/[id]` detay sayfası doğru render oldu (misafir için rezervasyon butonu görünmedi).
- Yolcu 1 kayıt olup rezervasyon talebi oluşturdu (`pending`); sürücü panelinden onayladı — `available_seats` `1 → 0` düştü, ilan durumu `full` oldu.
- Yolcu 2 kayıt olup dolu ilanda rezervasyon butonunun **görünmediği** doğrulandı.
- Yolcu 1 onaylanmış rezervasyonunu `/bookings`'ten iptal etti — koltuk `0 → 1` iade edildi, ilan durumu `active`'e döndü.
- Yolcu 2 (ilan tekrar aktifken) yeni bir talep oluşturdu; sürücü reddetti — koltuk sayısı değişmedi (`1/1` kaldı).
- Yolcu 2, reddedilen talebinden sonra **aynı ilana tekrar talep oluşturabildiği** doğrulandı (partial unique index yalnızca `pending`/`approved` durumlarını engelliyor, `rejected` sonrası yeniden talep serbest).
- AR locale'e geçildiğinde `<html dir="rtl">` doğru uygulandığı, layout'un aynalandığı (nav sırası, ok ikonu yönü, filtre çubuğu) görsel olarak doğrulandı.

Test sırasında oluşturulan tüm test verileri (2 test ilanı, 4 test rezervasyonu, ilgili 6 test profili) doğrulama bitince `public.profiles` üzerinden silinerek temizlendi (cascade ile ilan/rezervasyon satırları da silindi). Kalan ~12 "kabuk" test profili (rides/bookings'i olmayan, yalnızca kayıt sırasında oluşan boş `profiles` satırları — `auth.users`'a erişim bu oturumda kısıtlı olduğu için tam temizlenemedi) kalıcıdır; production'a açmadan önce Supabase Dashboard → Authentication → Users üzerinden `gb-test-*@example.com` desenine uyan hesapların silinmesi önerilir.

**Bu oturumda bulunup düzeltilen gerçek bir hata**: `/rides` filtre çubuğundaki sıralama (Sırala) alanı, seçili değeri çevrilmiş etiket yerine ham teknik değer (`date_asc` gibi) olarak gösteriyordu — Base UI'nin `SelectValue` bileşeni varsayılan olarak seçili `value`'yu render ediyor, eşleşen `SelectItem`'ın çevrilmiş içeriğini değil. `SelectValue`'ya bir render-prop (`{(value) => t(...)}`) eklenerek düzeltildi.

## Gerçek Supabase Doğrulaması

Proje kaydına göre Faz 2 kapsamında gerçek bir Supabase projesine karşı uçtan uca doğrulama yapıldı: gerçek bir kullanıcı hesabıyla kayıt/giriş/çıkış, avatar upload, profil ve ilan CRUD akışları, RLS politikaları (sahiplik dışı erişim reddi) ve `profiles`/`rides` arasındaki foreign key cascade (kullanıcı silindiğinde bağlı ilanların da silinmesi) test edildi.

**Bu oturumda (production hazırlık denetimi sırasında) bağımsız olarak doğrulanan kısım:**

- `.env.local` gerçek proje kimlik bilgileriyle dolu; `https://<proje>.supabase.co/auth/v1/health` uç noktası canlı ve yanıt veriyor (401 — apikey header'sız istekte beklenen davranış, servisin ayakta olduğunu doğrular).
- Uygulama bu gerçek proje kimlik bilgileriyle başlatıldığında (`npm run dev`) tüm herkese açık rotalar (`/`, `/rides`, `/login`, `/register`) HTTP 200 döndü; korumalı rotalar (`/profile`, `/create-ride`, `/rides/mine`) girişsiz durumda beklenen HTTP 307 (`/login`'e redirect) döndü.
- Canlı veritabanına salt-okunur bir sorgu ile (anon key, RLS'e tabi) mevcut satır sayısı doğrulandı: `profiles` tablosunda **1**, `rides` tablosunda **1** satır bulundu. Bunun doğrulama sürecinden kalan tek bir test hesabı/ilanı mı yoksa bilinçli bir seed mi olduğu bu oturumda ayırt edilemedi — **production'a açmadan önce bu satırların gözden geçirilip gerekirse temizlenmesi önerilir.**

**Bu oturumda doğrulanmayan (proje kaydına dayanan) kısım:** gerçek hesapla kayıt/giriş formlarının tarayıcıda uçtan uca çalıştırılması, avatar dosyası yükleme, RLS'in yetkisiz bir istekle fiilen reddettiğinin canlı test edilmesi — bunlar önceki doğrulama oturumunda yapıldı, bu oturumda tekrar edilmedi.

## Bu Oturumda Yapılan Denetim ve Sonuçları

| Kontrol | Sonuç |
|---|---|
| `npm run lint` (ESLint) | ✅ Temiz, hata/uyarı yok |
| `npx tsc --noEmit` | ✅ Temiz, tip hatası yok |
| `npm run build` (production build) | ✅ Başarılı, 11 rota, statik/dinamik render doğru |
| `console.log` / `TODO` / `FIXME` / `any` taraması | ✅ `src/` içinde hiç yok |
| `service_role` kullanımı | ✅ Kod tabanında hiçbir yerde yok — yalnızca anon key kullanılıyor |
| Dead code taraması | 🔧 3 kullanılmayan export bulundu ve temizlendi (aşağıya bakın) |
| i18n anahtar eşleşmesi (tr/ar) | ✅ 121/121 anahtar birebir eşleşiyor |
| `npm audit` | ⚠️ Faz 7'de yeniden çalıştırıldı: 6 uyarı (4 orta, 2 yüksek). Hepsi transitive: (1) Next.js'in kendi bundle'ındaki eski `postcss` (orta) ve `sharp`/libvips CVE'leri (yüksek — uygulama `next/image` kullanmıyor, gerçek maruziyet düşük), (2) `shadcn` CLI'ın (dev-only, runtime bundle'a girmiyor) `@modelcontextprotocol/sdk` → `@hono/node-server` zincirindeki path traversal (orta). Üçü de yalnızca `npm audit fix --force` ile düzelir, bu da Next'i 9.x'e düşürür — kabul edilemez, bilinçli olarak dokunulmadı. |
| `.env.local` git'e commit edilmiş mi | ✅ Hayır — `.gitignore`'daki `.env*` deseni tarafından hariç tutuluyor |
| `.env.example` güncel mi | ✅ `.env.local` ile birebir aynı 4 değişken |

### Temizlenen Kod (bu oturumda)

- `src/lib/supabase/client.ts` — hiçbir yerde import edilmeyen, kullanılmayan tarayıcı Supabase client'ı silindi (uygulama tamamen Server Components/Actions üzerinden çalışıyor, tarayıcı client'ına ihtiyaç yok).
- `src/features/rides/schemas.ts` — kullanılmayan `initialRideActionState` sabiti silindi (`RideForm` `useActionState` değil `react-hook-form` kullanıyor).
- `public/*.svg` (5 dosya) — `create-next-app`'ten kalan, hiçbir yerde referans edilmeyen varsayılan ikonlar silindi.

Bu değişikliklerden sonra lint/typecheck/build tekrar çalıştırıldı, hepsi temiz geçti; davranışta değişiklik yok.

### Stale Dev Server Notu

Denetim sırasında, port 3000'de önceden çalışan bir `next dev` sürecinin tüm rotalarda HTTP 500 döndüğü tespit edildi — kök neden, bu oturumdaki dosya silmelerinin (yukarıdaki dead code temizliği) çalışan Turbopack HMR sürecini bozmasıydı. Süreç sonlandırılıp yeniden başlatıldı; yeni süreç tüm rotalarda beklenen kodları döndürüyor (bkz. tablo). Bu, kod tabanında değil, çalışan geliştirme sürecinde geçici bir durumdu.

## Bilinen Sınırlamalar

- PWA: manifest + ikonlar + temel offline fallback var; gerçek bir "install" düğmesi/özel UI yok (tarayıcının kendi native install prompt'una güveniliyor).
- Push notification: yalnızca altyapı/soyutlama var (`src/lib/notifications.ts`), gerçek bir servis (web-push/FCM/OneSignal) entegre değil — çağrılar şu an no-op.
- hreflang/alternates yok: uygulama tek URL + cookie tabanlı locale kullanıyor (yol tabanlı `/tr`, `/ar` değil), bu yüzden standart hreflang modeli uygulanamıyor.
- Harita/autocomplete tabanlı şehir seçimi yok (81 il dropdown ile sınırlı)
- Ödeme/komisyon sistemi yok
- Telefon doğrulama yok
- Admin paneli / Dashboard / Analytics yok

Faz 5/6'ya özgü sınırlamalar için [README.md → Bilinen Sınırlamalar](./README.md#bilinen-sınırlamalar) bölümüne bakın (bir sürücünün ilan başına yalnızca bir yorum yazabilmesi, mesaj/yorumların düzenlenemez olması, push notification olmaması).

Diğer sınırlamalar (telefon formatı doğrulaması, npm audit uyarısı, ilanın otomatik `completed`'e geçmemesi) için [README.md → Bilinen Sınırlamalar](./README.md#bilinen-sınırlamalar) bölümüne bakın.
