-- Faz 5: messages table — 1:1 mesajlaşma, bir ilan (ride) bağlamında sürücü
-- ile onaylanmış rezervasyonu olan yolcu arasında. Grup sohbeti değil: her
-- satır tek bir gönderen/alıcı çiftine ait (bir sürücünün birden fazla
-- onaylanmış yolcusu varsa, her yolcuyla ayrı bir konuşma oluşur).

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  -- Sanity backstop mirroring MAX_MESSAGE_LENGTH in features/chat/schemas.ts.
  message text not null check (char_length(message) > 0 and char_length(message) <= 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_ride_id_idx on public.messages (ride_id);
create index messages_ride_id_created_at_idx on public.messages (ride_id, created_at);

alter table public.messages enable row level security;

-- Sadece gönderen veya alıcı okuyabilir — başka kimse bir konuşmayı göremez.
create policy "select own messages" on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Yalnızca kendi adına gönderebilir, ve yalnızca şu ikisinden biriyle: kendi
-- ilanının sürücüsüyle (kendisi onaylanmış yolcuysa) ya da kendi ilanına
-- onaylanmış bir yolcuyla (kendisi sürücüyse). Konuşabilecek başka kimse yok.
create policy "insert own message" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
      select 1 from public.rides r
      where r.id = messages.ride_id
        and (
          (r.driver_id = messages.sender_id and exists (
            select 1 from public.bookings b
            where b.ride_id = r.id and b.passenger_id = messages.receiver_id and b.status = 'approved'
          ))
          or
          (r.driver_id = messages.receiver_id and exists (
            select 1 from public.bookings b
            where b.ride_id = r.id and b.passenger_id = messages.sender_id and b.status = 'approved'
          ))
        )
    )
  );

-- Yalnızca alıcı, kendisine gelen bir mesajı güncelleyebilir — bu tek amaçla
-- kullanılır: "görüldü" (read_at) işaretlemek. Gönderen kendi mesajını
-- değiştiremez/silemez (update/delete policy yok).
create policy "update own received message" on public.messages
  for update to authenticated
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- Realtime: chat penceresinin anlık mesaj alabilmesi için bu tabloyu
-- Supabase'in varsayılan realtime publication'ına ekle. select RLS policy'si
-- realtime abonelikleri için de geçerlidir — bir istemci yalnızca kendi
-- gönderen/alıcı olduğu satırlara ait değişiklik event'lerini alır.
alter publication supabase_realtime add table public.messages;
