import "server-only"

// Faz 7 kapsamında yalnızca push notification altyapısı hazırlanıyor —
// gerçek bir servis (web-push, FCM, OneSignal, ...) henüz entegre değil.
// Aşağıdaki fonksiyon bilinçli olarak no-op'tur; gerçek servis seçildiğinde
// yalnızca bu fonksiyonun gövdesi değişecek, çağıran yerlerin (booking/chat
// action'ları) hiçbirinin değişmesi gerekmeyecek.
export type NotificationEvent =
  | { type: "booking_requested"; recipientId: string; rideId: string }
  | { type: "booking_approved"; recipientId: string; rideId: string }
  | { type: "booking_rejected"; recipientId: string; rideId: string }
  | { type: "new_message"; recipientId: string; rideId: string }

export async function sendPushNotification(event: NotificationEvent): Promise<void> {
  // Intentionally a no-op until a push provider is chosen and wired up.
  void event
}
