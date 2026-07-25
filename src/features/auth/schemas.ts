import { z } from "zod"

import { isValidTrPhoneNumber } from "@/lib/phone-validation"

export type AuthActionState = { error?: string; success?: boolean }

export const initialAuthActionState: AuthActionState = {}

export const MAX_PHONE_LENGTH = 20

// Zod's global setErrorMap is process-wide and would race across concurrent
// requests for different locales — schemas must be rebuilt per request with
// the resolved translator instead.
type ValidationTranslator = (
  key:
    | "invalidEmail"
    | "passwordMin"
    | "passwordRequired"
    | "passwordsMismatch"
    | "genderRequired"
    | "phoneRequired"
    | "phoneMax"
    | "phoneInvalid"
    | "termsRequired"
) => string

export function buildAuthSchemas(t: ValidationTranslator) {
  const emailSchema = z.string().email(t("invalidEmail"))
  const passwordSchema = z.string().min(8, t("passwordMin"))

  const signInSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, t("passwordRequired")),
  })

  const signUpSchema = z
    .object({
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
