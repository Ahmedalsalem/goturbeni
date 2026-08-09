"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { createOffer } from "@/features/bookings/actions"
import type { Booking } from "@/types/booking"

// createOffer'ın karşılığı — BookingButton'ın "ters" versiyonu. Koltuk
// sayısı sorulmaz (bir yolcu ilanı her zaman tam ride.seat_count kadar tek
// bir sürücü tarafından karşılanır). Reddedilmiş bir teklif tekrar teklif
// vermeyi engellemez (Task 2'nin unique index'i sadece pending/approved'ı
// kapsıyor) — bu yüzden yalnızca "rejected DEĞİL" bir teklif varken durum
// gösterilir, aksi halde yeniden teklif formu gösterilir.
export function OfferButton({ rideId, existingOffer }: { rideId: string; existingOffer: Booking | null }) {
  const t = useTranslations("Bookings")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (existingOffer && existingOffer.status !== "rejected") {
    return (
      <div className="flex items-center gap-3">
        <BookingStatusBadge status={existingOffer.status} />
        {existingOffer.status === "pending" && <CancelBookingButton bookingId={existingOffer.id} rideId={rideId} />}
        {existingOffer.status === "approved" && (
          <Link href={`/rides/${rideId}/bookings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("actions.manageOffer")}
          </Link>
        )}
      </div>
    )
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await createOffer(rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("offerCreated"))
        router.refresh()
      }
    })
  }

  return (
    <Button onClick={onSubmit} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
      {t("actions.makeOffer")}
    </Button>
  )
}
