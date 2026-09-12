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
    | "costSharePassengerMin"
    | "descriptionMax"
    | "districtInvalid"
    | "paymentMethodRequired"
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
      postedByRole: z.enum(["driver", "passenger"]).default("driver"),
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
      petsAllowed: z.boolean().default(false),
      smokingAllowed: z.boolean().default(false),
      largeLuggageOk: z.boolean().default(false),
      childSeatAvailable: z.boolean().default(false),
      wheelchairAccessible: z.boolean().default(false),
      usbChargerAvailable: z.boolean().default(false),
      acAvailable: z.boolean().default(false),
      paymentMethods: z.array(z.enum(["bank_transfer", "cash"])).min(1, t("paymentMethodRequired")).default(["bank_transfer"]),
      instantBooking: z.boolean().default(false),
      // Only read on create (RideForm hides it in edit mode) — the first
      // ride's own departureDate/departureTime supply the series' weekday
      // and time-of-day, so there's no separate recurrence field to fill in.
      repeatWeekly: z.boolean().default(false),
    })
    .refine((data) => data.departureCity !== data.arrivalCity, {
      message: t("sameCities"),
      path: ["arrivalCity"],
    })
    // Ücretsiz yolculuk seçeneği yalnızca sürücü ilanı için var (RideForm'da
    // "Ücretsiz yolculuk" kutusu yolcu modunda hiç gösterilmiyor) — yolcu
    // ilanında masraf payı 0 olamaz, kimseden bedava yolculuk istenemez.
    .refine((data) => data.postedByRole !== "passenger" || data.costShare > 0, {
      message: t("costSharePassengerMin"),
      path: ["costShare"],
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
    // Ödeme yöntemi/anında onay/haftalık tekrar yalnızca sürücü için anlamlı
    // (ilan sahibi henüz sürücü değil) — form bunları zaten gizliyor, ama şema
    // seviyesinde de zorlanıyor ki tamperlenmiş bir istek bu alanları dolaylı
    // yoldan set edemesin. petsAllowed/smokingAllowed/largeLuggageOk/
    // childSeatAvailable/wheelchairAccessible/usbChargerAvailable/acAvailable
    // istisna: yolcu için "kendi ihtiyacım" anlamına döndüğünden (ör. "sigara
    // içiyorum", "büyük bagajım var") her iki rolde de anlamlı — sıfırlanmaz.
    .transform((data) =>
      data.postedByRole === "passenger"
        ? {
            ...data,
            repeatWeekly: false,
            paymentMethods: ["bank_transfer"] as const,
            instantBooking: false,
          }
        : data
    )
}

// Output type (after zod coercion/transforms) — what the create/update actions receive.
export type RideFormValues = z.output<ReturnType<typeof buildRideSchema>>
// Input type (raw field values, e.g. seatCount as an uncoerced string) — what
// react-hook-form's useForm/register/Controller work with before the resolver runs.
export type RideFormInput = z.input<ReturnType<typeof buildRideSchema>>

export type RideActionState = { error?: string; success?: boolean }
