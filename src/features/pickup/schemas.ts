import { z } from "zod"

type ValidationTranslator = (key: "codeInvalid") => string

export function buildVerifyPickupCodeSchema(t: ValidationTranslator) {
  return z.object({
    code: z.string().regex(/^\d{4}$/, t("codeInvalid")),
  })
}

export type VerifyPickupCodeValues = z.output<ReturnType<typeof buildVerifyPickupCodeSchema>>
export type PickupActionState = { error?: string; success?: boolean }
