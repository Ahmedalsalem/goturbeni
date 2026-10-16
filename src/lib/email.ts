import "server-only"

import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, isRtlLocale, type AppLocale } from "@/i18n/locale-config"
import { NOTIFICATION_KEY, NOTIFICATION_URL, type NotificationEvent } from "@/lib/notifications"

// Brevo (transactional API); BREVO_API_KEY/EMAIL_FROM_ADDRESS ayarlanmamışsa
// (ör. yerel geliştirme) her gönderim no-op'a düşer, VAPID/push ile aynı desen.
export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM_ADDRESS)
}

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text?: string
}

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"

// Çıplak bir adres (görünen isim yok) spam filtrelerinde çoğu zaman kişisel/
// toplu-gönderim ayrımını zorlaştıran bir sinyal — özellikle yeni, düşük
// hacimli bir domain'de itibar kurulana kadar bu küçük fark önemli; tüm
// gönderimler aynı görünen ismi buradan alıyor.
async function postToBrevo(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY as string,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ sender: { name: "GötürBeni", email: process.env.EMAIL_FROM_ADDRESS }, ...body }),
  })
  if (!response.ok) {
    throw new Error(`Brevo ${response.status}: ${await response.text()}`)
  }
}

// Returns whether the send was accepted, for callers that must know
// (verification codes); best-effort callers can ignore the result.
export async function sendEmail(email: OutgoingEmail, context: string): Promise<boolean> {
  try {
    await postToBrevo({
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html,
      ...(email.text ? { textContent: email.text } : {}),
    })
    return true
  } catch (error) {
    logError(error, context)
    return false
  }
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

// Plain-text companion to renderEmailHtml — an HTML-only send (no `text`
// part) is itself a spam-scoring signal mailbox providers use (legitimate
// transactional mail almost always carries a text/plain alternative;
// HTML-only is disproportionately common in bulk/spam mail). Every
// single send below now passes both. bodyText must be plain
// content (no markup) — callers pass the same translation string used for
// bodyHtml when that string has no embedded HTML (true for every call site
// here; the one exception, the styled OTP code block, builds its own
// bodyText inline instead of reusing bodyHtml).
export function renderEmailText(params: {
  greeting: string
  bodyText: string
  ctaLabel?: string
  ctaUrl?: string
  signoff: string
  footerNote: string
}): string {
  const cta = params.ctaLabel && params.ctaUrl ? `${params.ctaLabel}: ${params.ctaUrl}\n\n` : ""
  return `${params.greeting}\n\n${params.bodyText}\n\n${cta}${params.signoff}\n\n---\n${params.footerNote}`
}

const BREVO_VERSIONS_PER_REQUEST = 100

// Multi-recipient fan-outs must go through here, not one send per recipient
// under Promise.all — that fires every request at once and trips the
// provider's rate limit as soon as the recipient list grows, which is what
// the old every-member new-ride broadcast hit in prod. One Brevo request
// carries up to 100 messageVersions, each with its own recipient and
// content. The top-level subject/htmlContent are required by the API but
// every version overrides them; textContent is deliberately left off the
// top level so a version without one never inherits another recipient's.
export async function sendEmailBatch(emails: OutgoingEmail[], context: string): Promise<void> {
  for (let i = 0; i < emails.length; i += BREVO_VERSIONS_PER_REQUEST) {
    const chunk = emails.slice(i, i + BREVO_VERSIONS_PER_REQUEST)
    try {
      await postToBrevo({
        subject: chunk[0].subject,
        htmlContent: chunk[0].html,
        messageVersions: chunk.map((email) => ({
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          ...(email.text ? { textContent: email.text } : {}),
        })),
      })
    } catch (error) {
      logError(error, context)
    }
  }
}

// Mandatory account verification (src/features/profile/actions.ts) — unlike
// sendEmailNotification below, this isn't a best-effort background
// notification: verification cannot proceed without it, so the caller needs
// to know whether it actually went out (a boolean, not a swallowed error).
export async function sendVerificationCodeEmail(to: string, code: string, locale: AppLocale): Promise<boolean> {
  if (!isEmailConfigured()) {
    return false
  }

  const t = await getTranslations({ locale, namespace: "Email" })
  // The code's styling lives here, not in the translated string — next-intl's
  // t() can't format a message containing raw HTML tags (a `<strong>` with an
  // attribute, or `<br>`, both trip INVALID_TAG); see email.test.ts.
  const codeBlockHtml = `<p style="margin:0 0 20px;">${t("verificationCodeIntro")}</p><p style="margin:0 0 20px;font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;background-color:#f4f4f5;border-radius:8px;padding:16px;">${code}</p><p style="margin:0;">${t("verificationCodeOutro")}</p>`
  const codeBlockText = `${t("verificationCodeIntro")}\n\n${code}\n\n${t("verificationCodeOutro")}`
  return sendEmail(
    {
      to,
      subject: t("verificationCodeSubject"),
      html: renderEmailHtml(locale, {
        greeting: t("greeting"),
        bodyHtml: codeBlockHtml,
        signoff: t("signoff"),
        footerNote: t("footerNote"),
      }),
      text: renderEmailText({
        greeting: t("greeting"),
        bodyText: codeBlockText,
        signoff: t("signoff"),
        footerNote: t("footerNote"),
      }),
    },
    "email.sendVerificationCodeEmail"
  )
}

// Admin panelden, doğrulanmamış bir hesaba elle tetiklenen tekrar gönderim
// (features/admin/actions.ts) — kullanıcının kendi normal akışından
// (sendVerificationCodeEmail) farklı olarak: kod süresiz (admin_resend_
// verification_code, 0086), ve gövde muhtemelen spam'e düşmüş ilk kod için
// açık bir özür içeriyor — kullanıcının doğrulanmamış hesapları incelerken
// fark ettiği gerçek bir şikayet üzerine eklendi.
export async function sendAdminResendVerificationEmail(to: string, code: string, locale: AppLocale): Promise<boolean> {
  if (!isEmailConfigured()) {
    return false
  }

  const t = await getTranslations({ locale, namespace: "Email" })
  const bodyHtml = `<p style="margin:0 0 20px;">${t("adminResendApology")}</p><p style="margin:0 0 20px;font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;background-color:#f4f4f5;border-radius:8px;padding:16px;">${code}</p><p style="margin:0;">${t("adminResendOutro")}</p>`
  const bodyText = `${t("adminResendApology")}\n\n${code}\n\n${t("adminResendOutro")}`
  return sendEmail(
    {
      to,
      subject: t("adminResendSubject"),
      html: renderEmailHtml(locale, {
        greeting: t("greeting"),
        bodyHtml,
        signoff: t("signoff"),
        footerNote: t("footerNote"),
      }),
      text: renderEmailText({
        greeting: t("greeting"),
        bodyText,
        signoff: t("signoff"),
        footerNote: t("footerNote"),
      }),
    },
    "email.sendAdminResendVerificationEmail"
  )
}

// Uygulama içi push bildirimi (src/lib/notifications.ts) kullanıcı siteyi
// açık tutmuyorsa görülmeyebiliyordu — aynı olaylar için e-posta yedeği.
// E-posta ayarlanmamışsa (ör. yerel geliştirme) no-op'a düşer, VAPID/push
// ile aynı desen (bkz. .env.example).
export async function sendEmailNotification(event: NotificationEvent): Promise<void> {
  if (!isEmailConfigured()) {
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

  await sendEmail(
    {
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
      text: renderEmailText({
        greeting: tCommon("greeting"),
        bodyText: t(`${key}Body`),
        ctaLabel: tCommon("viewLinkLabel"),
        ctaUrl: url,
        signoff: tCommon("signoff"),
        footerNote: tCommon("footerNote"),
      }),
    },
    "email.sendEmailNotification"
  )
}

// Fans out to every waitlisted passenger on a ride — same reasoning as
// sendSeatOpenedPushNotifications (src/lib/notifications.ts): doesn't fit
// the single-recipient NotificationEvent shape, so it's a standalone
// function rather than reusing sendEmailNotification's event union.
export async function sendSeatOpenedEmailNotifications(rideId: string): Promise<void> {
  if (!isEmailConfigured()) {
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

  const emails = await Promise.all(
    recipientRows.map(async (recipient) => {
      const locale = languageByUserId.get(recipient.user_id) ?? DEFAULT_LOCALE
      const t = await getTranslations({ locale, namespace: "Push.notifications" })
      const tCommon = await getTranslations({ locale, namespace: "Email" })
      return {
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
        text: renderEmailText({
          greeting: tCommon("greeting"),
          bodyText: t("seatOpenedBody"),
          ctaLabel: tCommon("viewLinkLabel"),
          ctaUrl: url,
          signoff: tCommon("signoff"),
          footerNote: tCommon("footerNote"),
        }),
      }
    })
  )
  await sendEmailBatch(emails, "email.sendSeatOpenedEmailNotifications")
}
