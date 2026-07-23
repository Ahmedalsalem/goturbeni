import "server-only"

import webpush from "web-push"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"

export type NotificationEvent =
  | { type: "booking_requested"; recipientId: string; rideId: string }
  | { type: "booking_approved"; recipientId: string; rideId: string }
  | { type: "booking_rejected"; recipientId: string; rideId: string }
  | { type: "new_message"; recipientId: string; rideId: string }

const NOTIFICATION_URL: Record<NotificationEvent["type"], (rideId: string) => string> = {
  booking_requested: (rideId) => `/rides/${rideId}/bookings`,
  booking_approved: () => `/bookings`,
  booking_rejected: () => `/bookings`,
  new_message: (rideId) => `/rides/${rideId}/chat`,
}

const NOTIFICATION_KEY: Record<NotificationEvent["type"], "bookingRequested" | "bookingApproved" | "bookingRejected" | "newMessage"> = {
  booking_requested: "bookingRequested",
  booking_approved: "bookingApproved",
  booking_rejected: "bookingRejected",
  new_message: "newMessage",
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

function isVapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

// Bir sağlayıcı gerektirmeyen (ücretsiz, tarayıcı standardı) Web Push/VAPID
// kullanır — bkz. .env.example. VAPID anahtarları ayarlanmamışsa (ör. yerel
// geliştirme) no-op'a düşer, tıpkı Supabase yapılandırılmamışken guest modun
// çökmemesi gibi (bkz. src/lib/supabase/is-configured.ts).
export async function sendPushNotification(event: NotificationEvent): Promise<void> {
  if (!isVapidConfigured()) {
    return
  }

  const supabase = await createClient()

  const { data: recipientProfile } = await supabase.from("profiles").select("language").eq("id", event.recipientId).single()
  const locale = (recipientProfile?.language as AppLocale | undefined) ?? DEFAULT_LOCALE
  const t = await getTranslations({ locale, namespace: "Push.notifications" })
  const key = NOTIFICATION_KEY[event.type]

  const { data, error: subscriptionsError } = await supabase.rpc("get_ride_counterparty_push_subscriptions", {
    p_ride_id: event.rideId,
    p_recipient_id: event.recipientId,
  })
  const subscriptions = data as PushSubscriptionRow[] | null
  if (subscriptionsError || !subscriptions || subscriptions.length === 0) {
    if (subscriptionsError) {
      logError(subscriptionsError, "notifications.sendPushNotification")
    }
    return
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)

  const payload = JSON.stringify({
    title: t(`${key}Title`),
    body: t(`${key}Body`),
    url: NOTIFICATION_URL[event.type](event.rideId),
  })

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload
        )
      } catch (error) {
        // 404/410 = the browser subscription no longer exists (uninstalled,
        // permission revoked, endpoint expired) — clean it up so future
        // events don't keep retrying a dead endpoint.
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.rpc("delete_ride_counterparty_push_subscription", {
            p_ride_id: event.rideId,
            p_recipient_id: event.recipientId,
            p_endpoint: subscription.endpoint,
          })
        } else {
          logError(error, "notifications.sendPushNotification")
        }
      }
    })
  )
}
