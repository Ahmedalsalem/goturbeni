"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CircleDollarSign, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { confirmRemainingPayment } from "@/features/bookings/actions"

// Either party's "Ödeme Tamamlandı" confirmation, shown on a completed,
// approved booking (see /bookings and /rides/[id]/bookings) until
// payment_status reaches 'settled' (both sides confirmed).
export function SettlePaymentButton({ bookingId, rideId }: { bookingId: string; rideId: string }) {
  const t = useTranslations("Bookings.payment")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await confirmRemainingPayment(bookingId, rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("settleSuccess"))
        router.refresh()
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CircleDollarSign className="size-4" aria-hidden="true" />}
      {t("settleCta")}
    </Button>
  )
}
