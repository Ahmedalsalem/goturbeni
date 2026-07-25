-- Sohbet içinde anlık konum paylaşımı. Yeni bir mesaj tipi olarak modellenir
-- (message_type), var olan `message` metin sütunu bir görüntüleme başlığı
-- olarak dolu kalır (NOT NULL kısıtlaması bozulmaz), gerçek koordinatlar
-- location_lat/location_lng'de tutulur. Mevcut "insert own message"/"select
-- own messages" RLS politikaları satır sahipliğine göre çalışıyor, yeni
-- sütunlarla ilgisiz olduğundan değişiklik gerekmiyor.

create type public.message_type as enum ('text', 'location');

alter table public.messages
  add column message_type public.message_type not null default 'text',
  add column location_lat double precision,
  add column location_lng double precision,
  add constraint messages_location_fields_check check (
    (message_type = 'text' and location_lat is null and location_lng is null)
    or (message_type = 'location' and location_lat is not null and location_lng is not null
        and location_lat between -90 and 90 and location_lng between -180 and 180)
  );
