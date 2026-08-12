"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { approveBooking, rejectBooking } from "@/features/bookings/actions"

type PendingAction = "approve" | "reject" | null

// isOffer: bu satır bir yolcu ilanına verilen sürücü teklifiyse (booker_role
// ='driver') true — o zaman "Teklifi Kabul Et" metni ve
// confirmApproveOffer/approveOffer i18n anahtarları kullanılır, normal bir
// rezervasyon talebinde ("approve"/"confirmApprove") değil.
export function BookingActions({ bookingId, rideId, isOffer = false }: { bookingId: string; rideId: string; isOffer?: boolean }) {
  const t = useTranslations("Bookings.actions")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<PendingAction>(null)

  function runAction(action: PendingAction) {
    if (confirming !== action) {
      setConfirming(action)
      return
    }
    startTransition(async () => {
      const result = action === "approve" ? await approveBooking(bookingId, rideId) : await rejectBooking(bookingId, rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(action === "approve" ? tSuccess(isOffer ? "offerApproved" : "approved") : tSuccess("rejected"))
        router.refresh()
      }
      setConfirming(null)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={confirming === "approve" ? "default" : "outline"}
        onClick={() => runAction("approve")}
        disabled={isPending}
      >
        {isPending && confirming === "approve" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        {confirming === "approve" ? t(isOffer ? "confirmApproveOffer" : "confirmApprove") : t(isOffer ? "approveOffer" : "approve")}
      </Button>
      <Button
        size="sm"
        variant={confirming === "reject" ? "destructive" : "outline"}
        onClick={() => runAction("reject")}
        disabled={isPending}
      >
        {isPending && confirming === "reject" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <X className="size-4" aria-hidden="true" />
        )}
        {confirming === "reject" ? t("confirmReject") : t("reject")}
      </Button>
    </div>
  )
}
