import { z } from "zod"

import { TURKISH_PROVINCES } from "@/utils/turkish-provinces"

export const MIN_SEAT_COUNT = 1
export const MAX_SEAT_COUNT = 8
export const MAX_DESCRIPTION_LENGTH = 500

type ValidationTranslator = (
  key:
    | "cityRequired"
    | "sameCities"
    | "dateRequired"
    | "timeRequired"
    | "departureInPast"
    | "seatCountRange"
    | "costShareMin"
    | "descriptionMax"
) => string

export function buildRideSchema(t: ValidationTranslator) {
  return z
    .object({
      departureCity: z.enum(TURKISH_PROVINCES, { message: t("cityRequired") }),
      arrivalCity: z.enum(TURKISH_PROVINCES, { message: t("cityRequired") }),
      departureDate: z.string().min(1, t("dateRequired")),
      departureTime: z.string().min(1, t("timeRequired")),
      seatCount: z.coerce
        .number()
        .int()
        .min(MIN_SEAT_COUNT, t("seatCountRange"))
        .max(MAX_SEAT_COUNT, t("seatCountRange")),
      costShare: z.coerce.number().min(0, t("costShareMin")),
      description: z
        .string()
        .trim()
        .max(MAX_DESCRIPTION_LENGTH, t("descriptionMax"))
        .optional()
        .transform((value) => (value ? value : undefined)),
    })
    .refine((data) => data.departureCity !== data.arrivalCity, {
      message: t("sameCities"),
      path: ["arrivalCity"],
    })
    .refine(
      (data) => {
        const departureAt = new Date(`${data.departureDate}T${data.departureTime}`)
        return departureAt.getTime() > Date.now()
      },
      { message: t("departureInPast"), path: ["departureTime"] }
    )
}

// Output type (after zod coercion/transforms) — what the create/update actions receive.
export type RideFormValues = z.output<ReturnType<typeof buildRideSchema>>
// Input type (raw field values, e.g. seatCount as an uncoerced string) — what
// react-hook-form's useForm/register/Controller work with before the resolver runs.
export type RideFormInput = z.input<ReturnType<typeof buildRideSchema>>

export type RideActionState = { error?: string; success?: boolean }
