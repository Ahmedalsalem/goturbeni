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

// Exported for src/lib/email.ts, which sends the same event to the same
// recipient via a different channel and needs the same title/body keys and
// deep link.
export const NOTIFICATION_URL: Record<NotificationEvent["type"], (rideId: string) => string> = {
  booking_requested: (rideId) => `/rides/${rideId}/bookings`,
  booking_approved: () => `/bookings`,
  booking_rejected: () => `/bookings`,
  new_message: (rideId) => `/rides/${rideId}/chat`,
}

export const NOTIFICATION_KEY: Record<
  NotificationEvent["type"],
  "bookingRequested" | "bookingApproved" | "bookingRejected" | "newMessage"
> = {
  booking_requested: "bookingRequested",
  booking_approved: "bookingApproved",
  booking_rejected: "bookingRejected",
  new_message: "newMessage",
}

// Which nav item's red dot (see Header.tsx / notification_events table) an
// event lights up — mirrors NOTIFICATION_URL's routing, minus new_message
// (already covered by the existing per-thread messages.read_at badge).
const NAV_TARGET_FOR_EVENT: Partial<Record<NotificationEvent["type"], "my_rides" | "my_bookings">> = {
  booking_requested: "my_rides",
  booking_approved: "my_bookings",
  booking_rejected: "my_bookings",
}

export async function recordNotificationEvent(event: NotificationEvent): Promise<void> {
  const navTarget = NAV_TARGET_FOR_EVENT[event.type]
  if (!navTarget) {
    return
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("create_notification_event", {
    p_ride_id: event.rideId,
    p_recipient_id: event.recipientId,
    p_nav_target: navTarget,
  })
  if (error) {
    logError(error, "notifications.recordNotificationEvent")
  }
}

interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
}

// Exported for src/lib/search-alert-notifications.ts, which needs both this
// and email.ts's isResendConfigured() to decide which channels to send on.
export function isVapidConfigured(): boolean {
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

// Fans out to every waitlisted passenger on a ride, not a single recipient —
// doesn't fit the NotificationEvent union above (which is always one
// recipientId), so this is a standalone function rather than a new event
// type. Called from cancelBooking (src/features/bookings/actions.ts) once an
// approved booking's seat is actually freed.
export async function sendSeatOpenedPushNotifications(rideId: string): Promise<void> {
  if (!isVapidConfigured()) {
    return
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_ride_waitlist_push_subscriptions", { p_ride_id: rideId })
  const subscriptions = data as PushSubscriptionRow[] | null
  if (error || !subscriptions || subscriptions.length === 0) {
    if (error) {
      logError(error, "notifications.sendSeatOpenedPushNotifications")
    }
    return
  }

  const { data: recipientProfiles } = await supabase
    .from("profiles")
    .select("id, language")
    .in(
      "id",
      subscriptions.map((s) => s.user_id)
    )
  const languageByUserId = new Map((recipientProfiles ?? []).map((p) => [p.id, p.language as AppLocale | null]))

  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  const url = `/rides/${rideId}`

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const locale = languageByUserId.get(subscription.user_id) ?? DEFAULT_LOCALE
      const t = await getTranslations({ locale, namespace: "Push.notifications" })
      const payload = JSON.stringify({ title: t("seatOpenedTitle"), body: t("seatOpenedBody"), url })
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload
        )
      } catch (sendError) {
        const statusCode = (sendError as { statusCode?: number }).statusCode
        if (statusCode !== 404 && statusCode !== 410) {
          logError(sendError, "notifications.sendSeatOpenedPushNotifications")
        }
        // Unlike sendPushNotification, a dead endpoint here isn't cleaned up
        // immediately — there's no per-recipient relationship RPC scoped to
        // this single waitlist entry; it'll get pruned the next time a
        // ride/booking event that DOES go through the normal relationship
        // path (booking_requested/approved/rejected/new_message) hits it.
      }
    })
  )
}

