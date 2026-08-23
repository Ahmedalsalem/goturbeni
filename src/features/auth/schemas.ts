import { z } from "zod"

import { isValidTrPhoneNumber } from "@/lib/phone-validation"

export type AuthActionState = { error?: string; success?: boolean }

export const initialAuthActionState: AuthActionState = {}

export const MAX_PHONE_LENGTH = 20
export const MAX_FULL_NAME_LENGTH = 100
export const MINIMUM_AGE_YEARS = 18

// Zod's global setErrorMap is process-wide and would race across concurrent
// requests for different locales — schemas must be rebuilt per request with
// the resolved translator instead.
type ValidationTranslator = (
  key:
    | "fullNameRequired"
    | "fullNameMax"
    | "invalidEmail"
    | "passwordMin"
    | "passwordRequired"
    | "passwordsMismatch"
    | "genderRequired"
    | "phoneRequired"
    | "phoneMax"
    | "phoneInvalid"
    | "termsRequired"
    | "dateOfBirthRequired"
    | "dateOfBirthInvalid"
    | "ageMinimum"
) => string

// "18 yaşından büyük/eşit" — doğum günü henüz gelmediyse yıl farkı tek başına
// yanıltıcı (ör. 17 yaş 364 gün, yıl farkı 18 görünür) — ay/gün karşılaştırması
// bunu düzeltiyor.
function isAtLeastAge(dateOfBirth: Date, minimumYears: number): boolean {
  const today = new Date()
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age -= 1
  }
  return age >= minimumYears
}

export function buildAuthSchemas(t: ValidationTranslator) {
  const emailSchema = z.string().email(t("invalidEmail"))
  const passwordSchema = z.string().min(8, t("passwordMin"))

  const signInSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, t("passwordRequired")),
  })

  const signUpSchema = z
    .object({
      fullName: z.string().trim().min(1, t("fullNameRequired")).max(MAX_FULL_NAME_LENGTH, t("fullNameMax")),
      email: emailSchema,
      password: passwordSchema,
      confirmPassword: z.string(),
      gender: z.enum(["female", "male"], { message: t("genderRequired") }),
      phone: z
        .string()
        .trim()
        .min(1, t("phoneRequired"))
        .max(MAX_PHONE_LENGTH, t("phoneMax"))
        .refine(isValidTrPhoneNumber, { message: t("phoneInvalid") }),
      dateOfBirth: z
        .string()
        .min(1, t("dateOfBirthRequired"))
        .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: t("dateOfBirthInvalid") })
        .refine((value) => isAtLeastAge(new Date(value), MINIMUM_AGE_YEARS), { message: t("ageMinimum") }),
      // Unchecked native checkboxes are simply absent from FormData
      // (formData.get returns null), not "off" — preprocess normalizes
      // null/undefined/"on" into a plain boolean before validation.
      emailNotificationsOptIn: z.preprocess((value) => value === "on", z.boolean()),
      // Zorunlu üyelik sözleşmesi onayı — "Bu platform ticari taşımacılık
      // yapılmasını kesinlikle yasaklar..." ibaresi Legal.terms içinde yer
      // alır (messages/tr.json), bu checkbox onu kayıt akışında zorunlu kılar.
      termsAccepted: z.literal("on", { message: t("termsRequired") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    })

  const forgotPasswordSchema = z.object({
    email: emailSchema,
  })

  const resetPasswordSchema = z
    .object({
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    })

  return { signInSchema, signUpSchema, forgotPasswordSchema, resetPasswordSchema }
}
