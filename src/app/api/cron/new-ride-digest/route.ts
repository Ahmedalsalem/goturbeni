import { NextResponse, type NextRequest } from "next/server"
import { getTranslations } from "next-intl/server"

import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"
import { isEmailConfigured, renderEmailHtml, renderEmailText, sendEmailBatch } from "@/lib/email"
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
            const badge =
              ride.postedByRole === "passenger" ? tCard("passengerListingBadge") : tCard("driverListingBadge")
            return `<li style="margin:0 0 8px;"><a href="${siteUrl}/rides/${ride.id}" style="color:#022844;font-weight:bold;">${from} → ${to}</a> · ${badge} · ${formatDate.format(new Date(ride.departureTime))}</li>`
          })
          .join("")
        const textItems = rides
          .map((ride) => {
            const from = getProvinceDisplayName(ride.departureCity, locale)
            const to = getProvinceDisplayName(ride.arrivalCity, locale)
            const badge =
              ride.postedByRole === "passenger" ? tCard("passengerListingBadge") : tCard("driverListingBadge")
            return `- ${from} → ${to} · ${badge} · ${formatDate.format(new Date(ride.departureTime))}: ${siteUrl}/rides/${ride.id}`
          })
          .join("\n")
        const intro = t("newRideDigestIntro", { count: rides.length })
        const footerNote = t("newRideDigestFooter", { url: `${siteUrl}/profile` })
        const subject =
          rides.length === 1
            ? t("newRideSingleSubject", {
                from: getProvinceDisplayName(rides[0].departureCity, locale),
                to: getProvinceDisplayName(rides[0].arrivalCity, locale),
              })
            : t("newRideDigestSubject")
        return {
          to: recipient.email,
          subject,
          html: renderEmailHtml(locale, {
            greeting: t("greeting"),
            bodyHtml: `<p style="margin:0 0 12px;">${intro}</p><ul style="margin:0;padding-inline-start:20px;">${items}</ul>`,
            ctaLabel: t("newRideDigestCta"),
            ctaUrl: `${siteUrl}/rides`,
            signoff: t("signoff"),
            footerNote,
          }),
          text: renderEmailText({
            greeting: t("greeting"),
            bodyText: `${intro}\n${textItems}`,
            ctaLabel: t("newRideDigestCta"),
            ctaUrl: `${siteUrl}/rides`,
            signoff: t("signoff"),
            footerNote,
          }),
        }
      })
    )
  ).filter((email) => email !== null)
  await sendEmailBatch(emails, "cron.newRideDigest", { "List-Unsubscribe": `<${siteUrl}/profile>` })

  return NextResponse.json({ ok: true, sent: emails.length })
}
