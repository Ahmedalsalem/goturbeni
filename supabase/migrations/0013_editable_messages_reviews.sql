-- Faz 9: mesaj ve yorumları düzenlenebilir/yumuşak-silinebilir hale getirir.
-- 0004_messages.sql ve 0005_reviews.sql'deki "kasıtlı olarak immutable"
-- kararı kullanıcı talebiyle tersine çevrildi: yazar (mesajı gönderen /
-- yorumu yazan), oluşturmadan sonraki 15 dakika içinde kendi satırını
-- düzenleyebilir veya yumuşak silebilir (`deleted_at` set edilir, satır
-- fiziksel olarak silinmez — denetim izi korunur, olası ileride bir
-- admin/audit ihtiyacı için içerik saklanır). Pencere kapandıktan sonra
-- satır yine immutable'a döner.
--
-- Yetkilendirme, 0003_bookings.sql'deki approve/reject/cancel_booking
-- fonksiyonlarıyla aynı security-definer RPC deseniyle yapılır: kolon
-- bazlı bir RLS update policy'si burada "gönderen mesaj içeriğini/
-- deleted_at'i değiştirebilir ama asla read_at'i değiştiremez, alıcı ise
-- sadece read_at'i değiştirebilir" kuralını tek bir policy içinde güvenle
-- ifade edemez — bir RPC ile bu ayrım fonksiyon gövdesinde açıkça yapılır.
--
-- 0003_bookings.sql'deki RPC'ler gibi burada da explicit `grant execute`
-- yok: Postgres'te yeni oluşturulan fonksiyonlara varsayılan olarak PUBLIC
-- execute izni verilir, PostgREST'in kullandığı `authenticated`/`anon`
-- rolleri de PUBLIC'e üye olduğundan bu yeterlidir (bkz. mevcut migration'lar
-- — hiçbiri RPC'leri için explicit grant içermiyor).

alter table public.messages add column edited_at timestamptz;
alter table public.messages add column deleted_at timestamptz;

alter table public.reviews add column edited_at timestamptz;
alter table public.reviews add column deleted_at timestamptz;

-- Gönderen kendi mesajını, oluşturmadan sonraki 15 dakika içinde ve henüz
-- silinmemişse düzenleyebilir. Uzunluk kısıtı, messages tablosundaki check
-- constraint ile aynı (0004_messages.sql).
create function public.edit_message(p_message_id uuid, p_new_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
begin
  if char_length(p_new_text) < 1 or char_length(p_new_text) > 2000 then
    raise exception 'invalid_message_length';
  end if;

  select * into v_message from public.messages where id = p_message_id for update;
  if not found then
    raise exception 'message_not_found';
  end if;
  if v_message.sender_id <> auth.uid() then
    raise exception 'not_message_sender';
  end if;
  if v_message.deleted_at is not null then
    raise exception 'message_deleted';
  end if;
  if v_message.created_at < now() - interval '15 minutes' then
    raise exception 'edit_window_expired';
  end if;

  update public.messages set message = p_new_text, edited_at = now() where id = p_message_id;
end;
$$;

-- İçerik (message sütunu) satırda saklanmaya devam eder — sadece deleted_at
-- işaretlenir, app katmanı deleted_at doluysa bir placeholder gösterir.
create function public.soft_delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.messages;
begin
  select * into v_message from public.messages where id = p_message_id for update;
  if not found then
    raise exception 'message_not_found';
  end if;
  if v_message.sender_id <> auth.uid() then
    raise exception 'not_message_sender';
  end if;
  if v_message.deleted_at is not null then
    raise exception 'message_deleted';
  end if;
  if v_message.created_at < now() - interval '15 minutes' then
    raise exception 'edit_window_expired';
  end if;

  update public.messages set deleted_at = now() where id = p_message_id;
end;
$$;

-- Rating/comment kısıtları 0005_reviews.sql'deki check constraint'lerle aynı.
create function public.edit_review(p_review_id uuid, p_new_rating smallint, p_new_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.reviews;
begin
  if p_new_rating < 1 or p_new_rating > 5 then
    raise exception 'invalid_rating';
  end if;
  if p_new_comment is not null and char_length(p_new_comment) > 500 then
    raise exception 'invalid_comment_length';
  end if;

  select * into v_review from public.reviews where id = p_review_id for update;
  if not found then
    raise exception 'review_not_found';
  end if;
  if v_review.reviewer_id <> auth.uid() then
    raise exception 'not_review_author';
  end if;
  if v_review.deleted_at is not null then
    raise exception 'review_deleted';
  end if;
  if v_review.created_at < now() - interval '15 minutes' then
    raise exception 'edit_window_expired';
  end if;

  update public.reviews set rating = p_new_rating, comment = p_new_comment, edited_at = now() where id = p_review_id;
end;
$$;

create function public.soft_delete_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.reviews;
begin
  select * into v_review from public.reviews where id = p_review_id for update;
  if not found then
    raise exception 'review_not_found';
  end if;
  if v_review.reviewer_id <> auth.uid() then
    raise exception 'not_review_author';
  end if;
  if v_review.deleted_at is not null then
    raise exception 'review_deleted';
  end if;
  if v_review.created_at < now() - interval '15 minutes' then
    raise exception 'edit_window_expired';
  end if;

  update public.reviews set deleted_at = now() where id = p_review_id;
end;
$$;

-- Realtime: messages tablosu 0004_messages.sql'de zaten supabase_realtime
-- publication'ına eklendi; buradaki RPC'ler o tablonun mevcut satırlarını
-- UPDATE ettiği için ek bir publication değişikliği gerekmiyor. Mevcut
-- "select own messages" / "select all reviews" RLS politikaları yeni
-- edited_at/deleted_at sütunlarını da otomatik olarak kapsar (politikalar
-- sütun bazlı değil, satır bazlı), bu yüzden RLS tarafında da değişiklik
-- gerekmiyor.
