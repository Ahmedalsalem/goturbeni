"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { approveBooking, rejectBooking } from "@/features/bookings/actions"

type PendingAction = "approve" | "reject" | null

export function BookingActions({ bookingId, rideId }: { bookingId: string; rideId: string }) {
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
        toast.success(action === "approve" ? tSuccess("approved") : tSuccess("rejected"))
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
        {confirming === "approve" ? t("confirmApprove") : t("approve")}
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
