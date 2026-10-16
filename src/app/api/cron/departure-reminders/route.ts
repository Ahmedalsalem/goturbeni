import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"
import { isEmailConfigured, renderEmailHtml, sendEmailBatch } from "@/lib/email"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

interface ReminderRecipient {
  email: string
  name: string | null
  language: AppLocale | null
  role: "driver" | "passenger"
}

interface ReminderPayload {
  rideId: string
  departureCity: string
  arrivalCity: string
  recipients: ReminderRecipient[]
}

// send_departure_reminders() (0081_departure_reminder.sql) pg_net ile günde
// bir kez burayı çağırır — e-posta render'ı ve gönderimi Postgres'ten
// yapılamadığından gerçek gönderim burada yapılıyor. Authorization
// başlığındaki secret, migration'da ayarlanan app.cron_secret ile aynı
// CRON_SECRET env var'a karşı kontrol ediliyor; eşleşmezse istek reddedilir.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true })
  }

  const payload = (await request.json()) as ReminderPayload
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const url = `${siteUrl}/rides/${payload.rideId}`

  const emails = await Promise.all(
    payload.recipients.map(async (recipient) => {
      const locale = recipient.language ?? DEFAULT_LOCALE
      const t = await getTranslations({ locale, namespace: "Email" })
      const from = getProvinceDisplayName(payload.departureCity, locale)
      const to = getProvinceDisplayName(payload.arrivalCity, locale)
      return {
        to: recipient.email,
        subject: t("departureReminderSubject"),
        html: renderEmailHtml(locale, {
          greeting: t("greeting"),
          bodyHtml: t("departureReminderBody", { from, to }),
          ctaLabel: t("viewLinkLabel"),
          ctaUrl: url,
          signoff: t("signoff"),
          footerNote: t("footerNote"),
        }),
      }
    })
  )
  await sendEmailBatch(emails, "cron.departureReminders")

  return NextResponse.json({ ok: true })
}
