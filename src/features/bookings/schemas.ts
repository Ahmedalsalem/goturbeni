import { z } from "zod"

export const MIN_BOOKING_SEAT_COUNT = 1

type ValidationTranslator = (key: "seatCountMin") => string

export function buildBookingSchema(t: ValidationTranslator) {
  return z.object({
    seatCount: z.coerce.number().int().min(MIN_BOOKING_SEAT_COUNT, t("seatCountMin")),
  })
}

export type BookingFormValues = z.output<ReturnType<typeof buildBookingSchema>>
export type BookingFormInput = z.input<ReturnType<typeof buildBookingSchema>>

export type BookingActionState = { error?: string; success?: boolean }
