import { z } from "zod"

export type AuthActionState = { error?: string; success?: boolean }

export const initialAuthActionState: AuthActionState = {}

// Zod's global setErrorMap is process-wide and would race across concurrent
// requests for different locales — schemas must be rebuilt per request with
// the resolved translator instead.
type ValidationTranslator = (key: "invalidEmail" | "passwordMin" | "passwordRequired" | "passwordsMismatch") => string

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
