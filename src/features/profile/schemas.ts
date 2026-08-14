import { z } from "zod"

import { SUPPORTED_LOCALES } from "@/i18n/locale-config"
import { isValidTrPhoneNumber } from "@/lib/phone-validation"

export type ProfileActionState = { error?: string; success?: boolean }

export const initialProfileActionState: ProfileActionState = {}

export const MAX_FULL_NAME_LENGTH = 100
export const MAX_PHONE_LENGTH = 20
export const MAX_BIO_LENGTH = 500
export const MAX_IBAN_LENGTH = 34
export const MAX_IBAN_HOLDER_NAME_LENGTH = 100
export const MAX_CAR_BRAND_LENGTH = 50
export const MAX_CAR_MODEL_LENGTH = 50
export const MAX_CAR_PLATE_LENGTH = 15

// TR + 24 digits (26 chars total), spaces/dashes stripped before matching —
// the standard Turkish IBAN format (matches the DB check constraint in
// supabase/migrations/0016_gender_payment_profile.sql).
const TR_IBAN_PATTERN = /^TR\d{24}$/

// Turkish vehicle plate: 2-digit province code (01-81) + 1-3 letters (Turkish
// plates never use Q, W or X) + digits, digit count depending on letter
// count — e.g. "34 A 1234", "06 AB 123", "34 ABC 12". Spaces optional.
// Exported for features/rides/actions.ts, which requires the driver's
// profile to already have a valid plate before a ride can be created.
export const TR_PLATE_PATTERN =
  /^(0[1-9]|[1-7][0-9]|8[01])\s?[A-PR-VYZ]\s?\d{4,5}$|^(0[1-9]|[1-7][0-9]|8[01])\s?[A-PR-VYZ]{2}\s?\d{3,4}$|^(0[1-9]|[1-7][0-9]|8[01])\s?[A-PR-VYZ]{3}\s?\d{2,3}$/

type ValidationTranslator = (
  key:
    | "fullNameRequired"
    | "fullNameMax"
    | "phoneMax"
    | "phoneInvalid"
    | "bioMax"
    | "ibanInvalid"
    | "ibanHolderNameMax"
    | "carBrandMax"
    | "carModelMax"
    | "carPlateMax"
    | "carPlateInvalid"
) => string

export function buildProfileSchema(t: ValidationTranslator) {
  return z.object({
    fullName: z.string().trim().min(1, t("fullNameRequired")).max(MAX_FULL_NAME_LENGTH, t("fullNameMax")),
    phone: z
      .string()
      .trim()
      .max(MAX_PHONE_LENGTH, t("phoneMax"))
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => !value || isValidTrPhoneNumber(value), { message: t("phoneInvalid") }),
    bio: z
      .string()
      .trim()
      .max(MAX_BIO_LENGTH, t("bioMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    language: z.enum(SUPPORTED_LOCALES),
    iban: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => !value || TR_IBAN_PATTERN.test(value), { message: t("ibanInvalid") }),
    ibanHolderName: z
      .string()
      .trim()
      .max(MAX_IBAN_HOLDER_NAME_LENGTH, t("ibanHolderNameMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    carBrand: z
      .string()
      .trim()
      .max(MAX_CAR_BRAND_LENGTH, t("carBrandMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    carModel: z
      .string()
      .trim()
      .max(MAX_CAR_MODEL_LENGTH, t("carModelMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    carPlate: z
      .string()
      .trim()
      .max(MAX_CAR_PLATE_LENGTH, t("carPlateMax"))
      .optional()
      .transform((value) => (value ? value.toUpperCase() : undefined))
      // Only drivers who post rides need a plate at all (see carHint) — this
      // field stays optional at the profile level, ride creation enforces
      // presence separately (see features/rides/actions.ts). When a value IS
      // given, though, it must be a real Turkish plate format.
      .refine((value) => !value || TR_PLATE_PATTERN.test(value), { message: t("carPlateInvalid") }),
    hasAc: z.boolean().default(false),
  })
}
