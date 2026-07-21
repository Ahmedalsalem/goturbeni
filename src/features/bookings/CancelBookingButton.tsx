"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cancelBooking } from "@/features/bookings/actions"

export function CancelBookingButton({ bookingId, rideId }: { bookingId: string; rideId: string }) {
  const t = useTranslations("Bookings.actions")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await cancelBooking(bookingId, rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("cancelled"))
        router.refresh()
      }
      setConfirming(false)
    })
  }

  return (
    <Button variant={confirming ? "destructive" : "outline"} size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
      {confirming ? t("confirmCancel") : t("cancel")}
    </Button>
  )
}
