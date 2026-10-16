import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"
import { isEmailConfigured, renderEmailHtml, sendEmailBatch } from "@/lib/email"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

interface DigestRide {
  id: string
  departureCity: string
  arrivalCity: string
  departureTime: string
  postedByRole: "driver" | "passenger"
  postedBy: string
}

interface DigestRecipient {
  userId: string
  email: string
  language: AppLocale | null
}

interface DigestPayload {
  rides: DigestRide[]
  recipients: DigestRecipient[]
}

// send_new_ride_digest() (0102_new_ride_daily_digest.sql) pg_net ile günde
// bir kez burayı çağırır: son 24 saatte açılan ilanlar + tüm alıcılar. Her
// alıcıya tek e-posta; kendi açtığı ilanlar onun listesinden çıkarılıyor ve
// listesi boş kalan alıcıya hiç gönderilmiyor. Yetkilendirme
// cron/departure-reminders ile aynı (cron_config.cron_secret = CRON_SECRET).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: true })
  }

  const payload = (await request.json()) as DigestPayload
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

  const emails = (
    await Promise.all(
      payload.recipients.map(async (recipient) => {
        const rides = payload.rides.filter((ride) => ride.postedBy !== recipient.userId)
        if (rides.length === 0) {
          return null
        }
        const locale = recipient.language ?? DEFAULT_LOCALE
        const t = await getTranslations({ locale, namespace: "Email" })
        const tCard = await getTranslations({ locale, namespace: "Rides.card" })
        const formatDate = new Intl.DateTimeFormat(locale, {
          timeZone: "Europe/Istanbul",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })
        const items = rides
          .map((ride) => {
            const from = getProvinceDisplayName(ride.departureCity, locale)
            const to = getProvinceDisplayName(ride.arrivalCity, locale)
            const badge = ride.postedByRole === "passenger" ? tCard("passengerListingBadge") : tCard("driverListingBadge")
            return `<li style="margin:0 0 8px;"><a href="${siteUrl}/rides/${ride.id}" style="color:#022844;font-weight:bold;">${from} → ${to}</a> · ${badge} · ${formatDate.format(new Date(ride.departureTime))}</li>`
          })
          .join("")
        return {
          to: recipient.email,
          subject: t("newRideDigestSubject"),
          html: renderEmailHtml(locale, {
            greeting: t("greeting"),
            bodyHtml: `<p style="margin:0 0 12px;">${t("newRideDigestIntro", { count: rides.length })}</p><ul style="margin:0;padding-inline-start:20px;">${items}</ul>`,
            ctaLabel: t("newRideDigestCta"),
            ctaUrl: `${siteUrl}/rides`,
            signoff: t("signoff"),
            footerNote: t("footerNote"),
          }),
        }
      })
    )
  ).filter((email) => email !== null)
  await sendEmailBatch(emails, "cron.newRideDigest")

  return NextResponse.json({ ok: true, sent: emails.length })
}
