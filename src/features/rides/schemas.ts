import { z } from "zod"

import { TURKISH_PROVINCES } from "@/utils/turkish-provinces"
import { TURKISH_PROVINCE_DISTRICTS } from "@/utils/turkish-districts"
import { parseIstanbulDateTime } from "@/utils/istanbul-time"

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
    | "districtInvalid"
) => string

// District is optional (a refinement on top of the required city), so an
// empty selection must transform to undefined rather than "" reaching the DB.
function districtField() {
  return z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
}

export function buildRideSchema(t: ValidationTranslator) {
  return z
    .object({
      departureCity: z.enum(TURKISH_PROVINCES, { message: t("cityRequired") }),
      arrivalCity: z.enum(TURKISH_PROVINCES, { message: t("cityRequired") }),
      departureDistrict: districtField(),
      arrivalDistrict: districtField(),
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
        const departureAt = parseIstanbulDateTime(data.departureDate, data.departureTime)
        return departureAt.getTime() > Date.now()
      },
      { message: t("departureInPast"), path: ["departureTime"] }
    )
    .refine((data) => !data.departureDistrict || TURKISH_PROVINCE_DISTRICTS[data.departureCity]?.includes(data.departureDistrict), {
      message: t("districtInvalid"),
      path: ["departureDistrict"],
    })
    .refine((data) => !data.arrivalDistrict || TURKISH_PROVINCE_DISTRICTS[data.arrivalCity]?.includes(data.arrivalDistrict), {
      message: t("districtInvalid"),
      path: ["arrivalDistrict"],
    })
}

// Output type (after zod coercion/transforms) — what the create/update actions receive.
export type RideFormValues = z.output<ReturnType<typeof buildRideSchema>>
// Input type (raw field values, e.g. seatCount as an uncoerced string) — what
// react-hook-form's useForm/register/Controller work with before the resolver runs.
export type RideFormInput = z.input<ReturnType<typeof buildRideSchema>>

export type RideActionState = { error?: string; success?: boolean }
