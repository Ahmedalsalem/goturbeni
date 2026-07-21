import { z } from "zod"

import { SUPPORTED_LOCALES } from "@/i18n/locale-config"

export type ProfileActionState = { error?: string; success?: boolean }

export const initialProfileActionState: ProfileActionState = {}

export const MAX_FULL_NAME_LENGTH = 100
export const MAX_PHONE_LENGTH = 20
export const MAX_BIO_LENGTH = 500

type ValidationTranslator = (key: "fullNameRequired" | "fullNameMax" | "phoneMax" | "bioMax") => string

export function buildProfileSchema(t: ValidationTranslator) {
  return z.object({
    fullName: z.string().trim().min(1, t("fullNameRequired")).max(MAX_FULL_NAME_LENGTH, t("fullNameMax")),
    phone: z
      .string()
      .trim()
      .max(MAX_PHONE_LENGTH, t("phoneMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    bio: z
      .string()
      .trim()
      .max(MAX_BIO_LENGTH, t("bioMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
    language: z.enum(SUPPORTED_LOCALES),
  })
}
