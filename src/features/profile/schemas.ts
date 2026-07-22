import { z } from "zod"
import { isValidPhoneNumber } from "libphonenumber-js"

import { SUPPORTED_LOCALES } from "@/i18n/locale-config"

export type ProfileActionState = { error?: string; success?: boolean }

export const initialProfileActionState: ProfileActionState = {}

export const MAX_FULL_NAME_LENGTH = 100
export const MAX_PHONE_LENGTH = 20
export const MAX_BIO_LENGTH = 500

type ValidationTranslator = (key: "fullNameRequired" | "fullNameMax" | "phoneMax" | "phoneInvalid" | "bioMax") => string

export function buildProfileSchema(t: ValidationTranslator) {
  return z.object({
    fullName: z.string().trim().min(1, t("fullNameRequired")).max(MAX_FULL_NAME_LENGTH, t("fullNameMax")),
    phone: z
      .string()
      .trim()
      .max(MAX_PHONE_LENGTH, t("phoneMax"))
      .optional()
      .transform((value) => (value ? value : undefined))
      // Defaults to Turkish numbering when no "+<country code>" prefix is
      // given (this platform's primary market); a leading "+" is parsed
      // using its own country code regardless, so non-Turkish numbers
      // (relevant for the Arabic-speaking locale) still validate correctly.
      .refine((value) => !value || isValidPhoneNumber(value, "TR"), { message: t("phoneInvalid") }),
    bio: z
      .string()
      .trim()
      .max(MAX_BIO_LENGTH, t("bioMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    language: z.enum(SUPPORTED_LOCALES),
  })
}
