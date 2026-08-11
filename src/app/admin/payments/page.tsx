import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileText, Receipt } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"

import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { BulkApproveReceiptsButton } from "@/features/admin/BulkApproveReceiptsButton"
import { ConfirmRefundButton } from "@/features/admin/ConfirmRefundButton"
import { RejectRefundButton } from "@/features/admin/RejectRefundButton"
import { SettlementReceiptReviewActions } from "@/features/admin/SettlementReceiptReviewActions"
import { computeReceiptRiskTier, type ReceiptRiskTier } from "@/features/admin/risk"
import {
  getPendingRefunds,
  getPendingSettlementReceipts,
  getSuspiciousAccounts,
  type AdminBookingRow,
} from "@/features/admin/queries"
import { getUserIdsWithOpenDisputes } from "@/features/disputes/queries"
import { getSignedReceiptUrl } from "@/features/bookings/queries"
import { getUserLocale } from "@/i18n/locale"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.payments")
  return { title: t("title") }
}

function RouteLabel({ booking, locale }: { booking: AdminBookingRow; locale: string }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      {getProvinceDisplayName(booking.ride.departure_city, locale)}
      <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
      {getProvinceDisplayName(booking.ride.arrival_city, locale)}
    </p>
  )
}

function RiskBadge({ tier, label }: { tier: ReceiptRiskTier; label: string }) {
  return <Badge variant={tier === "low" ? "secondary" : "warning"}>{label}</Badge>
}

export default async function AdminPaymentsPage() {
  const t = await getTranslations("Admin.payments")
  const format = await getFormatter()
  const locale = await getUserLocale()
  const [pendingSettlements, pendingRefunds, suspiciousAccounts, disputedUserIds] = await Promise.all([
    getPendingSettlementReceipts(),
    getPendingRefunds(),
    getSuspiciousAccounts(),
    getUserIdsWithOpenDisputes(),
  ])
  const suspiciousUserIds = new Set(suspiciousAccounts.map((account) => account.user_id))

  function riskTierFor(booking: AdminBookingRow, rejectCount: number): ReceiptRiskTier {
    if (!booking.passenger) {
      return "high"
    }
    return computeReceiptRiskTier({
      passengerId: booking.passenger.id,
      passengerCreatedAt: booking.passenger.created_at,
      passengerSuspended: booking.passenger.admin_flags?.is_suspended ?? false,
      rejectCount,
      suspiciousUserIds,
      disputedUserIds,
    })
  }

  const settlementRiskTiers = pendingSettlements.map((booking) => riskTierFor(booking, booking.settlement_receipt_reject_count))
  const lowRiskSettlementIds = pendingSettlements.filter((_, index) => settlementRiskTiers[index] === "low").map((booking) => booking.id)

  const settlementReceiptUrls = await Promise.all(
    pendingSettlements.map((booking) => (booking.settlement_receipt_url ? getSignedReceiptUrl(booking.settlement_receipt_url) : null))
  )
  const refundProofUrls = await Promise.all(
    pendingRefunds.map((booking) => (booking.refund_proof_url ? getSignedReceiptUrl(booking.refund_proof_url) : null))
  )

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{t("settlementReceiptsTitle")}</h2>
          {lowRiskSettlementIds.length > 0 && <BulkApproveReceiptsButton bookingIds={lowRiskSettlementIds} />}
        </div>
        {pendingSettlements.length === 0 ? (
          <EmptyState icon={Receipt} title={t("noPendingSettlements")} description="" />
        ) : (
          <div className="flex flex-col gap-3">
            {pendingSettlements.map((booking, index) => (
              <Card key={booking.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{booking.passenger?.full_name ?? t("unknownUser")}</p>
                      <RiskBadge tier={settlementRiskTiers[index]} label={settlementRiskTiers[index] === "low" ? t("riskLow") : t("riskHigh")} />
                    </div>
                    <RouteLabel booking={booking} locale={locale} />
                    <p className="text-muted-foreground text-xs">{t("driverLabel")}: {booking.ride.driver?.full_name ?? t("unknownUser")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {settlementReceiptUrls[index] && (
                      <Link
                        href={settlementReceiptUrls[index]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary flex items-center gap-1 text-sm underline"
                      >
                        <FileText className="size-4" aria-hidden="true" /> {t("viewReceipt")}
                      </Link>
                    )}
                    <SettlementReceiptReviewActions bookingId={booking.id} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium">{t("refundsTitle")}</h2>
        {pendingRefunds.length === 0 ? (
          <EmptyState icon={Receipt} title={t("noPendingRefunds")} description="" />
        ) : (
          <div className="flex flex-col gap-3">
            {pendingRefunds.map((booking, index) => (
              <Card key={booking.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{t("driverLabel")}: {booking.ride.driver?.full_name ?? t("unknownUser")}</p>
                    <RouteLabel booking={booking} locale={locale} />
                    <p className="text-muted-foreground text-xs">
                      {t("passengerLabel")}: {booking.passenger?.full_name ?? t("unknownUser")} ·{" "}
                      {booking.refund_requested_at && format.dateTime(new Date(booking.refund_requested_at), { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {refundProofUrls[index] && (
                      <Link href={refundProofUrls[index]!} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1 text-sm underline">
                        <FileText className="size-4" aria-hidden="true" /> {t("viewReceipt")}
                      </Link>
                    )}
                    <RejectRefundButton bookingId={booking.id} />
                    <ConfirmRefundButton bookingId={booking.id} />
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
