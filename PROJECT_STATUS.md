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

Bu nedenle **"GötürBeni v0.6.0" için henüz gerçek Supabase doğrulaması yoktur** — yalnızca statik/yerel doğrulama tamamlanmıştır. `package.json` sürümü bilinçli olarak `0.4.1`'de bırakıldı; canlı doğrulama tamamlanınca güncellenecektir.

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
| `npm audit` | ⚠️ Next.js'in kendi `node_modules`'ündeki eski `postcss`'ten kaynaklanan 2 orta önem uyarı — düzeltme Next'i 9.x'e düşürür, kabul edilemez, bilinçli olarak dokunulmadı |
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

Faz 5 ve Faz 6 tamamlandıktan sonra, bunlar bilinçli olarak Faz 7+'e bırakılmıştır:

- PWA yok
- Push notification yok
- Harita/autocomplete tabanlı şehir seçimi yok (81 il dropdown ile sınırlı)
- Ödeme/komisyon sistemi yok
- Telefon doğrulama yok
- Admin paneli / Dashboard / Analytics yok

Faz 5/6'ya özgü sınırlamalar için [README.md → Bilinen Sınırlamalar](./README.md#bilinen-sınırlamalar) bölümüne bakın (bir sürücünün ilan başına yalnızca bir yorum yazabilmesi, mesaj/yorumların düzenlenemez olması, push notification olmaması).

Diğer sınırlamalar (telefon formatı doğrulaması, npm audit uyarısı, ilanın otomatik `completed`'e geçmemesi) için [README.md → Bilinen Sınırlamalar](./README.md#bilinen-sınırlamalar) bölümüne bakın.
