"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldLabel } from "@/components/ui/field"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { createBooking } from "@/features/bookings/actions"
import { MIN_BOOKING_SEAT_COUNT } from "@/features/bookings/schemas"
import { ExperienceLevelBadge } from "@/features/reviews/ExperienceLevelBadge"
import { StarRating } from "@/features/reviews/StarRating"
import type { Booking } from "@/types/booking"

export interface DriverTrustInfo {
  memberSinceIso: string
  completedRideCount: number
  averageRating: number | null
  reviewCount: number
}

export function BookingButton({
  rideId,
  availableSeats,
  existingBooking,
  driverPaymentInfo,
  driverTrustInfo,
  instantBooking,
}: {
  rideId: string
  availableSeats: number
  existingBooking: Booking | null
  driverPaymentInfo: { iban: string; iban_holder_name: string } | null
  driverTrustInfo: DriverTrustInfo | null
  instantBooking: boolean
}) {
  const t = useTranslations("Bookings")
  const tPayment = useTranslations("Bookings.payment")
  const tSuccess = useTranslations("Bookings.success")
  const format = useFormatter()
  const router = useRouter()
  const [seatCount, setSeatCount] = useState(MIN_BOOKING_SEAT_COUNT)
  const [isPending, startTransition] = useTransition()

  if (existingBooking) {
    const isApprovedAwaitingPayment = existingBooking.status === "approved" && existingBooking.payment_status !== "settled"

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <BookingStatusBadge status={existingBooking.status} />
          {(existingBooking.status === "pending" || existingBooking.status === "approved") && (
            <CancelBookingButton bookingId={existingBooking.id} rideId={rideId} />
          )}
        </div>
        {isApprovedAwaitingPayment && driverPaymentInfo && (
          <Alert>
            <AlertTitle>{tPayment("settlementInstructionTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <span>
                {tPayment("ibanLabel")}: <span className="font-mono font-medium">{driverPaymentInfo.iban}</span>
              </span>
              <span>
                {tPayment("ibanHolderLabel")}: {driverPaymentInfo.iban_holder_name}
              </span>
              <span className="text-muted-foreground">{tPayment("noCommissionDisclaimer")}</span>
              {driverTrustInfo && (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2">
                  <ExperienceLevelBadge completedRideCount={driverTrustInfo.completedRideCount} />
                  <span className="text-muted-foreground text-xs">
                    {tPayment("driverMemberSince", {
                      date: format.dateTime(new Date(driverTrustInfo.memberSinceIso), { day: "2-digit", month: "2-digit", year: "numeric" }),
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {tPayment("driverCompletedRides", { count: driverTrustInfo.completedRideCount })}
                  </span>
                  {driverTrustInfo.averageRating !== null && (
                    <span className="flex items-center gap-1">
                      <StarRating rating={driverTrustInfo.averageRating} size="sm" />
                      <span className="text-muted-foreground text-xs">({driverTrustInfo.reviewCount})</span>
                    </span>
                  )}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await createBooking(rideId, { seatCount })
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(instantBooking ? tSuccess("createdInstant") : tSuccess("created"))
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-end gap-3">
      <Field className="w-28">
        <FieldLabel htmlFor="booking-seat-count">{t("form.seatCount")}</FieldLabel>
        <Input
          id="booking-seat-count"
          type="number"
          min={MIN_BOOKING_SEAT_COUNT}
          max={availableSeats}
          value={seatCount}
          onChange={(event) => setSeatCount(Number(event.target.value))}
        />
      </Field>
      <Button onClick={onSubmit} disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {t("actions.reserve")}
      </Button>
    </div>
  )
}
