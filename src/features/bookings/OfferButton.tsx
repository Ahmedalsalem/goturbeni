"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { createOffer } from "@/features/bookings/actions"
import { formatCostShare } from "@/utils/currency"
import type { Booking } from "@/types/booking"

// createOffer'ın karşılığı — BookingButton'ın "ters" versiyonu. Koltuk
// sayısı sorulmaz (bir yolcu ilanı her zaman tam ride.seat_count kadar tek
// bir sürücü tarafından karşılanır), ama fiyat sorulur: sürücü kendi
// fiyatını önerir. İlanın cost_share'i bağlayıcı bir tavan DEĞİL, sadece
// yolcunun referans olarak yazdığı fiyat — parayı alan taraf sürücü
// olduğundan bir üst sınır dayatmak yanlış teşvik olurdu (bkz.
// 0090_passenger_listing_offer_price.sql). Reddedilmiş bir teklif tekrar
// teklif vermeyi engellemez (Task 2'nin unique index'i sadece pending/
// approved'ı kapsıyor) — bu yüzden yalnızca "rejected DEĞİL" bir teklif
// varken durum gösterilir, aksi halde yeniden teklif formu gösterilir.
export function OfferButton({
  rideId,
  existingOffer,
  referenceCostShare,
}: {
  rideId: string
  existingOffer: Booking | null
  referenceCostShare: number
}) {
  const t = useTranslations("Bookings")
  const tSuccess = useTranslations("Bookings.success")
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [offeredCostShare, setOfferedCostShare] = useState(String(referenceCostShare))

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
      const result = await createOffer(rideId, { offeredCostShare: Number(offeredCostShare) })
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("offerCreated"))
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="offer-cost-share">{t("form.offeredCostShare")}</FieldLabel>
        <Input
          id="offer-cost-share"
          type="number"
          min={0}
          step={1}
          value={offeredCostShare}
          onChange={(event) => setOfferedCostShare(event.target.value)}
        />
        <FieldDescription>
          {t("form.offeredCostShareReferenceHint", { amount: formatCostShare(referenceCostShare, locale) })}
        </FieldDescription>
      </Field>
      <Button onClick={onSubmit} disabled={isPending} className="w-full">
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-4" aria-hidden="true" />
        )}
        {t("actions.makeOffer")}
      </Button>
    </div>
  )
}
