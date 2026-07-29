import "server-only"

import webpush from "web-push"
import { Resend } from "resend"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"
import { isVapidConfigured } from "@/lib/notifications"
import { isResendConfigured } from "@/lib/email"

interface SearchAlertRecipientRow {
  user_id: string
  email: string
  endpoint: string | null
  p256dh: string | null
  auth: string | null
}

// One combined push+email fan-out, deliberately NOT split into two
// single-channel functions (unlike sendSeatOpenedPushNotifications/
// sendSeatOpenedEmailNotifications) — get_search_alert_recipients
// (0043_ride_search_alerts.sql) is a one-shot RPC: it marks the ride as
// "already notified" the moment it's called, so calling it twice (once per
// channel) would let the first call silently consume the one legitimate
// invocation and starve the second channel. Called from createRide
// (src/features/rides/actions.ts) right after a successful insert.
export async function sendSearchAlertNotifications(rideId: string): Promise<void> {
  const vapidConfigured = isVapidConfigured()
  const resendConfigured = isResendConfigured()
  if (!vapidConfigured && !resendConfigured) {
    return
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_search_alert_recipients", { p_ride_id: rideId })
  const rows = data as SearchAlertRecipientRow[] | null
  if (error || !rows || rows.length === 0) {
    if (error) {
      logError(error, "searchAlertNotifications.sendSearchAlertNotifications")
    }
    return
  }

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = await supabase.from("profiles").select("id, language").in("id", userIds)
  const languageByUserId = new Map((profiles ?? []).map((p) => [p.id, p.language as AppLocale | null]))
  const url = `/rides/${rideId}`

  const pushPromise = vapidConfigured
    ? (() => {
        webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
        return Promise.all(
          rows
            .filter((r) => r.endpoint && r.p256dh && r.auth)
            .map(async (row) => {
              const locale = languageByUserId.get(row.user_id) ?? DEFAULT_LOCALE
              const t = await getTranslations({ locale, namespace: "Push.notifications" })
              const payload = JSON.stringify({ title: t("searchAlertMatchTitle"), body: t("searchAlertMatchBody"), url })
              try {
                await webpush.sendNotification({ endpoint: row.endpoint!, keys: { p256dh: row.p256dh!, auth: row.auth! } }, payload)
              } catch (sendError) {
                const statusCode = (sendError as { statusCode?: number }).statusCode
                if (statusCode !== 404 && statusCode !== 410) {
                  logError(sendError, "searchAlertNotifications.push")
                }
              }
            })
        )
      })()
    : Promise.resolve()

  const emailPromise = resendConfigured
    ? (() => {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
        const uniqueRecipients = new Map(rows.map((r) => [r.user_id, r.email]))
        return Promise.all(
          [...uniqueRecipients.entries()].map(async ([userId, email]) => {
            const locale = languageByUserId.get(userId) ?? DEFAULT_LOCALE
            const t = await getTranslations({ locale, namespace: "Push.notifications" })
            const tCommon = await getTranslations({ locale, namespace: "Email" })
            try {
              await resend.emails.send({
                from: process.env.RESEND_FROM_EMAIL!,
                to: email,
                subject: t("searchAlertMatchTitle"),
                html: `<p>${t("searchAlertMatchBody")}</p><p><a href="${siteUrl}${url}">${tCommon("viewLinkLabel")}</a></p>`,
              })
            } catch (sendError) {
              logError(sendError, "searchAlertNotifications.email")
            }
          })
        )
      })()
    : Promise.resolve()

  await Promise.all([pushPromise, emailPromise])
}
