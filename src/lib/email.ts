import "server-only"

import { Resend } from "resend"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"
import { NOTIFICATION_KEY, NOTIFICATION_URL, type NotificationEvent } from "@/lib/notifications"

function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
}

// Mandatory account verification (src/features/profile/actions.ts) — unlike
// sendEmailNotification below, this isn't a best-effort background
// notification: verification cannot proceed without it, so the caller needs
// to know whether it actually went out (a boolean, not a swallowed error).
export async function sendVerificationCodeEmail(to: string, code: string, locale: AppLocale): Promise<boolean> {
  if (!isResendConfigured()) {
    return false
  }

  const t = await getTranslations({ locale, namespace: "Email" })
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to,
      subject: t("verificationCodeSubject"),
      html: `<p>${t.rich("verificationCodeBody", { code, strong: (chunks) => `<strong>${chunks}</strong>` })}</p>`,
    })
    return true
  } catch (error) {
    logError(error, "email.sendVerificationCodeEmail")
    return false
  }
}

// Uygulama içi push bildirimi (src/lib/notifications.ts) kullanıcı siteyi
// açık tutmuyorsa görülmeyebiliyordu — aynı olaylar için e-posta yedeği.
// Resend, RESEND_API_KEY/RESEND_FROM_EMAIL ayarlanmamışsa (ör. yerel
// geliştirme) no-op'a düşer, VAPID/push ile aynı desen (bkz. .env.example).
export async function sendEmailNotification(event: NotificationEvent): Promise<void> {
  if (!isResendConfigured()) {
    return
  }

  const supabase = await createClient()

  const [{ data: recipientProfile }, { data: recipientEmail, error: emailError }] = await Promise.all([
    supabase.from("profiles").select("language").eq("id", event.recipientId).single(),
    supabase.rpc("get_ride_counterparty_email", { p_ride_id: event.rideId, p_recipient_id: event.recipientId }),
  ])

  if (emailError || !recipientEmail) {
    if (emailError) {
      logError(emailError, "email.sendEmailNotification")
    }
    return
  }

  const locale = (recipientProfile?.language as AppLocale | undefined) ?? DEFAULT_LOCALE
  const t = await getTranslations({ locale, namespace: "Push.notifications" })
  const tCommon = await getTranslations({ locale, namespace: "Email" })
  const key = NOTIFICATION_KEY[event.type]
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const url = `${siteUrl}${NOTIFICATION_URL[event.type](event.rideId)}`

  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: recipientEmail as string,
      subject: t(`${key}Title`),
      html: `<p>${t(`${key}Body`)}</p><p><a href="${url}">${tCommon("viewLinkLabel")}</a></p>`,
    })
  } catch (error) {
    logError(error, "email.sendEmailNotification")
  }
}
