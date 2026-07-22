-- `profiles` ve `profiles_private` iki ayrı tablo olduğu için profil formu
-- tek bir Supabase çağrısıyla ikisini birden güncelleyemiyor. İki ayrı
-- update/upsert çağrısı yapmak, ikincisi (phone) başarısız olduğunda
-- birincisinin (full_name/bio/language) sessizce kalıcı olduğu bir kısmi
-- yazma riski taşır. Tek bir fonksiyon çağrısı Postgres'te tek bir işlem
-- (transaction) olarak çalıştığı için bu iki yazımı atomik hale getiriyor.
-- `security invoker` yeterli (definer gerekmiyor): her iki tablo da zaten
-- `auth.uid() = id` ile sahibine yazma izni veren RLS politikalarına sahip,
-- bu fonksiyon yalnızca bu iki çağrıyı tek transaction'da birleştiriyor.
create function public.update_own_profile(
  p_full_name text,
  p_bio text,
  p_language text,
  p_avatar_url text,
  p_phone text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.profiles
    set full_name = p_full_name,
        bio = p_bio,
        language = p_language,
        avatar_url = coalesce(p_avatar_url, avatar_url)
    where id = auth.uid();

  insert into public.profiles_private (id, phone)
  values (auth.uid(), p_phone)
  on conflict (id) do update set phone = excluded.phone;
end;
$$;

-- 0006_profiles_phone_privacy.sql'deki "select own phone" politikası, bu
-- projedeki diğer tüm sahibiyle-sınırlı politikaların aksine `to
-- authenticated` belirtmiyordu (yalnızca `using (auth.uid() = id)`). Anon
-- için `auth.uid()` her zaman null döndüğünden hiçbir satır eşleşmiyordu —
-- pratikte açık bir güvenlik açığı yoktu — ama projenin geri kalanıyla
-- tutarlılık için rolü de açıkça kısıtlıyoruz.
alter policy "select own phone" on public.profiles_private
  to authenticated;
