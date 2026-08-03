import "server-only"

import { Resend } from "resend"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, isRtlLocale, type AppLocale } from "@/i18n/locale-config"
import { NOTIFICATION_KEY, NOTIFICATION_URL, type NotificationEvent } from "@/lib/notifications"

// Exported for src/lib/search-alert-notifications.ts.
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
}

// Shared branded wrapper for every outgoing email — a bare `<p>text</p>` had
// no greeting, sign-off, or visual identity at all. RTL-aware (Arabic mail
// clients need dir="rtl" and mirrored alignment, not just RTL-shaped text).
export function renderEmailHtml(
  locale: AppLocale,
  params: { greeting: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string; signoff: string; footerNote: string }
): string {
  const dir = isRtlLocale(locale) ? "rtl" : "ltr"
  const align = dir === "rtl" ? "right" : "left"
  const logoMargin = dir === "rtl" ? "margin-right" : "margin-left"
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const logoUrl = `${siteUrl}/icons/icon-192.png`
  const cta =
    params.ctaLabel && params.ctaUrl
      ? `<p style="margin:0 0 24px;"><a href="${params.ctaUrl}" style="display:inline-block;background-color:#47A736;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;">${params.ctaLabel}</a></p>`
      : ""

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${locale}">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:480px;width:100%;">
            <tr>
              <td style="background-color:#022844;padding:24px 32px;text-align:${align};">
                <img src="${logoUrl}" width="32" height="32" alt="GötürBeni" style="vertical-align:middle;border-radius:8px;" />
                <span style="color:#ffffff;font-size:18px;font-weight:bold;${logoMargin}:8px;vertical-align:middle;">GötürBeni</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;text-align:${align};color:#022844;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${params.greeting}</p>
                <div style="margin:0 0 24px;">${params.bodyHtml}</div>
                ${cta}
                <p style="margin:0;color:#022844;">${params.signoff}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#f4f4f5;text-align:${align};color:#64748b;font-size:12px;">
                ${params.footerNote}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
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
    // The code's styling lives here, not in the translated string — next-intl's
    // t() can't format a message containing raw HTML tags (a `<strong>` with an
    // attribute, or `<br>`, both trip INVALID_TAG); see email.test.ts.
    const codeBlockHtml = `<p style="margin:0 0 20px;">${t("verificationCodeIntro")}</p><p style="margin:0 0 20px;font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;background-color:#f4f4f5;border-radius:8px;padding:16px;">${code}</p><p style="margin:0;">${t("verificationCodeOutro")}</p>`
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to,
      subject: t("verificationCodeSubject"),
      html: renderEmailHtml(locale, {
        greeting: t("greeting"),
        bodyHtml: codeBlockHtml,
        signoff: t("signoff"),
        footerNote: t("footerNote"),
      }),
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
      html: renderEmailHtml(locale, {
        greeting: tCommon("greeting"),
        bodyHtml: t(`${key}Body`),
        ctaLabel: tCommon("viewLinkLabel"),
        ctaUrl: url,
        signoff: tCommon("signoff"),
        footerNote: tCommon("footerNote"),
      }),
    })
  } catch (error) {
    logError(error, "email.sendEmailNotification")
  }
}

// Fans out to every waitlisted passenger on a ride — same reasoning as
// sendSeatOpenedPushNotifications (src/lib/notifications.ts): doesn't fit
// the single-recipient NotificationEvent shape, so it's a standalone
// function rather than reusing sendEmailNotification's event union.
export async function sendSeatOpenedEmailNotifications(rideId: string): Promise<void> {
  if (!isResendConfigured()) {
    return
  }

  const supabase = await createClient()
  const { data: recipients, error } = await supabase.rpc("get_ride_waitlist_emails", { p_ride_id: rideId })
  if (error || !recipients || recipients.length === 0) {
    if (error) {
      logError(error, "email.sendSeatOpenedEmailNotifications")
    }
    return
  }

  const recipientRows = recipients as { user_id: string; email: string }[]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, language")
    .in(
      "id",
      recipientRows.map((r) => r.user_id)
    )
  const languageByUserId = new Map((profiles ?? []).map((p) => [p.id, p.language as AppLocale | null]))

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const url = `${siteUrl}/rides/${rideId}`
  const resend = new Resend(process.env.RESEND_API_KEY)

  await Promise.all(
    recipientRows.map(async (recipient) => {
      const locale = languageByUserId.get(recipient.user_id) ?? DEFAULT_LOCALE
      const t = await getTranslations({ locale, namespace: "Push.notifications" })
      const tCommon = await getTranslations({ locale, namespace: "Email" })
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: recipient.email,
          subject: t("seatOpenedTitle"),
          html: renderEmailHtml(locale, {
            greeting: tCommon("greeting"),
            bodyHtml: t("seatOpenedBody"),
            ctaLabel: tCommon("viewLinkLabel"),
            ctaUrl: url,
            signoff: tCommon("signoff"),
            footerNote: tCommon("footerNote"),
          }),
        })
      } catch (sendError) {
        logError(sendError, "email.sendSeatOpenedEmailNotifications")
      }
    })
  )
}
