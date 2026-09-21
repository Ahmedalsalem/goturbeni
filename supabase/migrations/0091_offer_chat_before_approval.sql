-- Bir yolcu ilanına teklif veren sürücü ile ilan sahibi (yolcu), teklif
-- henüz onaylanmadan önce de mesajlaşabilsin (kullanıcı isteği, 2026-09-21:
-- "Teklif Ver" yanına "Mesaj Yaz" de eklensin). messages'ın "insert own
-- message" politikası (0004_messages.sql) sadece rides.driver_id + approved
-- booking'e bakıyordu — bir yolcu ilanında driver_id onay anına kadar NULL
-- olduğundan bu koşul hiç sağlanamıyordu. Yeni dal: booker_role='driver'
-- olan bir bookings satırı pending VEYA approved ise, o teklifin sahibi
-- sürücü ile ilan sahibi (passenger_id) birbirine mesaj atabilir —
-- ride.driver_id'ye hiç bakmadan, doğrudan bookings üzerinden.
drop policy "insert own message" on public.messages;
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
          or
          exists (
            select 1 from public.bookings b
            where b.ride_id = r.id
              and b.booker_role = 'driver'
              and b.status in ('pending', 'approved')
              and (
                (b.driver_id = messages.sender_id and b.passenger_id = messages.receiver_id)
                or (b.driver_id = messages.receiver_id and b.passenger_id = messages.sender_id)
              )
          )
        )
    )
  );
