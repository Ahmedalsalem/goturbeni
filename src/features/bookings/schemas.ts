import { z } from "zod"

export const MIN_BOOKING_SEAT_COUNT = 1

type ValidationTranslator = (key: "seatCountMin" | "offeredCostShareMin") => string

export function buildBookingSchema(t: ValidationTranslator) {
  return z.object({
    seatCount: z.coerce.number().int().min(MIN_BOOKING_SEAT_COUNT, t("seatCountMin")),
  })
}

export type BookingFormValues = z.output<ReturnType<typeof buildBookingSchema>>
export type BookingFormInput = z.input<ReturnType<typeof buildBookingSchema>>

export type BookingActionState = { error?: string; success?: boolean }

// Bir yolcu ilanına teklif veren sürücünün önerdiği fiyat — ilanın kendi
// cost_share'i "en fazla bu kadar öderim" üst sınırı olarak kalıyor, gerçek
// sınır karşılaştırması (ride'a erişimi olmayan bu şema değil) createOffer
// action'ında yapılıyor.
export function buildOfferSchema(t: ValidationTranslator) {
  return z.object({
    offeredCostShare: z.coerce.number().min(0, t("offeredCostShareMin")),
  })
}

export type OfferFormValues = z.output<ReturnType<typeof buildOfferSchema>>
export type OfferFormInput = z.input<ReturnType<typeof buildOfferSchema>>
