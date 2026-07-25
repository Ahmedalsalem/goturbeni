"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Field, FieldLabel } from "@/components/ui/field"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { ReceiptUploadForm } from "@/features/bookings/ReceiptUploadForm"
import { createBooking, submitDepositReceipt } from "@/features/bookings/actions"
import { MIN_BOOKING_SEAT_COUNT } from "@/features/bookings/schemas"
import type { Booking } from "@/types/booking"

export function BookingButton({
  rideId,
  availableSeats,
  existingBooking,
  driverPaymentInfo,
}: {
  rideId: string
  availableSeats: number
  existingBooking: Booking | null
  driverPaymentInfo: { iban: string; iban_holder_name: string } | null
}) {
  const t = useTranslations("Bookings")
  const tPayment = useTranslations("Bookings.payment")
  const tSuccess = useTranslations("Bookings.success")
  const format = useFormatter()
  const router = useRouter()
  const [seatCount, setSeatCount] = useState(MIN_BOOKING_SEAT_COUNT)
  const [isPending, startTransition] = useTransition()

  if (existingBooking) {
    const awaitingDeposit = existingBooking.status === "pending" && existingBooking.payment_status === "awaiting_deposit"

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <BookingStatusBadge status={existingBooking.status} />
          {(existingBooking.status === "pending" || existingBooking.status === "approved") && (
            <CancelBookingButton bookingId={existingBooking.id} rideId={rideId} />
          )}
        </div>
        {awaitingDeposit && driverPaymentInfo && (
          <Alert>
            <AlertTitle>
              {tPayment("depositInstructionTitle", {
                deadline: format.dateTime(new Date(existingBooking.deposit_deadline_at), { hour: "2-digit", minute: "2-digit" }),
              })}
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <span>
                {tPayment("ibanLabel")}: <span className="font-mono font-medium">{driverPaymentInfo.iban}</span>
              </span>
              <span>
                {tPayment("ibanHolderLabel")}: {driverPaymentInfo.iban_holder_name}
              </span>
              <span className="text-muted-foreground">{tPayment("noCommissionDisclaimer")}</span>
            </AlertDescription>
          </Alert>
        )}
        {awaitingDeposit && driverPaymentInfo && (
          <div className="flex items-center gap-2">
            {existingBooking.deposit_receipt_status === null || existingBooking.deposit_receipt_status === "rejected" ? (
              <ReceiptUploadForm
                action={(formData) => submitDepositReceipt(existingBooking.id, rideId, formData)}
                label={tPayment("uploadReceipt")}
              />
            ) : (
              <Badge variant={existingBooking.deposit_receipt_status === "approved" ? "secondary" : "outline"}>
                {tPayment(`receiptStatus.${existingBooking.deposit_receipt_status}`)}
              </Badge>
            )}
          </div>
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
