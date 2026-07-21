"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { createBooking } from "@/features/bookings/actions"
import { MIN_BOOKING_SEAT_COUNT } from "@/features/bookings/schemas"
import type { Booking } from "@/types/booking"

export function BookingButton({
  rideId,
  availableSeats,
  existingBooking,
}: {
  rideId: string
  availableSeats: number
  existingBooking: Booking | null
}) {
  const t = useTranslations("Bookings")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [seatCount, setSeatCount] = useState(MIN_BOOKING_SEAT_COUNT)
  const [isPending, startTransition] = useTransition()

  if (existingBooking) {
    return (
      <div className="flex items-center gap-3">
        <BookingStatusBadge status={existingBooking.status} />
        {(existingBooking.status === "pending" || existingBooking.status === "approved") && (
          <CancelBookingButton bookingId={existingBooking.id} rideId={rideId} />
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
        toast.success(tSuccess("created"))
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
