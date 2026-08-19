import "server-only"

import { Resend } from "resend"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locale-config"
import { isResendConfigured, renderEmailHtml } from "@/lib/email"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

interface BroadcastRecipientRow {
  user_id: string
  email: string
}

// Every new ride emails every member — a deliberately broader fan-out than
// sendSearchAlertNotifications (search-alert-notifications.ts), which only
// reaches users who saved a matching route alert. This was an explicit user
// request, not a design default: as the user base grows, mailing everyone on
// every single ride posted is a real deliverability/spam-complaint risk (no
// per-user opt-out exists for it, unlike search alerts which are opt-in by
// construction). get_all_member_emails_for_broadcast (0067_new_ride_
// broadcast.sql) marks the ride as dispatched the moment it's called, so a
// retry of this function for the same ride is a no-op, not a second blast.
export async function sendNewRideBroadcastEmail(
  rideId: string,
  departureCity: string,
  arrivalCity: string,
  postedByRole: "driver" | "passenger"
): Promise<void> {
  if (!isResendConfigured()) {
    return
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_all_member_emails_for_broadcast", { p_ride_id: rideId })
  const rows = data as BroadcastRecipientRow[] | null
  if (error || !rows || rows.length === 0) {
    if (error) {
      logError(error, "newRideBroadcastEmail.sendNewRideBroadcastEmail")
    }
    return
  }

  const userIds = rows.map((r) => r.user_id)
  const { data: profiles } = await supabase.from("profiles").select("id, language").in("id", userIds)
  const languageByUserId = new Map((profiles ?? []).map((p) => [p.id, p.language as AppLocale | null]))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  const url = `${siteUrl}/rides/${rideId}`
  const resend = new Resend(process.env.RESEND_API_KEY)

  await Promise.all(
    rows.map(async (row) => {
      const locale = languageByUserId.get(row.user_id) ?? DEFAULT_LOCALE
      const t = await getTranslations({ locale, namespace: "Email" })
      const tCommon = t
      const from = getProvinceDisplayName(departureCity, locale)
      const to = getProvinceDisplayName(arrivalCity, locale)
      // A driver listing means seats are available (someone's already
      // driving); a passenger listing means someone's looking for a ride and
      // a driver would need to offer one — different enough actions that the
      // broadcast body says which one this is, reusing the exact same
      // "Sürücü İlanı"/"Yolcu İlanı" wording RideCard's own badge uses
      // (Rides.card.driverListingBadge/passengerListingBadge).
      const bodyKey = postedByRole === "passenger" ? "newRideBroadcastBodyPassenger" : "newRideBroadcastBodyDriver"
      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL!,
          to: row.email,
          subject: t("newRideBroadcastSubject"),
          html: renderEmailHtml(locale, {
            greeting: tCommon("greeting"),
            bodyHtml: t(bodyKey, { from, to }),
            ctaLabel: tCommon("viewLinkLabel"),
            ctaUrl: url,
            signoff: tCommon("signoff"),
            footerNote: tCommon("footerNote"),
          }),
        })
      } catch (sendError) {
        logError(sendError, "newRideBroadcastEmail.email")
      }
    })
  )
}
