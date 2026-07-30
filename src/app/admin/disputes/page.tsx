import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowRight, ShieldQuestion } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Card, CardContent } from "@/components/ui/card"
import { AdminDisputeResolveActions } from "@/features/disputes/AdminDisputeResolveActions"
import { DisputeStatusBadge } from "@/features/disputes/DisputeStatusBadge"
import { getOpenDisputesForAdmin, getResolvedDisputesForAdmin } from "@/features/disputes/queries"
import { getUserLocale } from "@/i18n/locale"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.disputes")
  return { title: t("title") }
}

export default async function AdminDisputesPage() {
  const t = await getTranslations("Admin.disputes")
  const locale = await getUserLocale()
  const format = await getFormatter()
  const [openDisputes, resolvedDisputes] = await Promise.all([getOpenDisputesForAdmin(), getResolvedDisputesForAdmin()])

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">{t("openTitle")}</h2>
        {openDisputes.length === 0 ? (
          <EmptyState icon={ShieldQuestion} title={t("noOpenDisputes")} description="" />
        ) : (
          <div className="flex flex-col gap-3">
            {openDisputes.map((dispute) => (
              <Card key={dispute.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {dispute.opened_by_profile?.full_name ?? t("unknownUser")} → {dispute.against_user_profile?.full_name ?? t("unknownUser")}
                      </p>
                      <DisputeStatusBadge status={dispute.status} />
                    </div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      {getProvinceDisplayName(dispute.booking.ride.departure_city, locale)}
                      <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                      {getProvinceDisplayName(dispute.booking.ride.arrival_city, locale)}
                    </p>
                    <p className="text-muted-foreground text-xs">{t(`reason.${dispute.reason}`)}</p>
                    <p className="mt-1 max-w-md text-sm">{dispute.description}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {format.dateTime(new Date(dispute.created_at), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <AdminDisputeResolveActions disputeId={dispute.id} status={dispute.status} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">{t("resolvedTitle")}</h2>
        {resolvedDisputes.length === 0 ? (
          <EmptyState icon={ShieldQuestion} title={t("noResolvedDisputes")} description="" />
        ) : (
          <div className="flex flex-col gap-3">
            {resolvedDisputes.map((dispute) => (
              <Card key={dispute.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {dispute.opened_by_profile?.full_name ?? t("unknownUser")} → {dispute.against_user_profile?.full_name ?? t("unknownUser")}
                      </p>
                      <DisputeStatusBadge status={dispute.status} />
                    </div>
                    <p className="text-muted-foreground text-xs">{t(`reason.${dispute.reason}`)}</p>
                    <p className="mt-1 max-w-md text-sm">{dispute.description}</p>
                    {dispute.resolution_note && (
                      <p className="text-muted-foreground mt-1 max-w-md text-xs">
                        {t("resolutionNoteLabel")}: {dispute.resolution_note}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
