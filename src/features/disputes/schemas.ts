import { z } from "zod"

export const DISPUTE_DESCRIPTION_MIN = 10
export const DISPUTE_DESCRIPTION_MAX = 2000

type ValidationTranslator = (key: "descriptionMin" | "descriptionMax") => string

export function buildDisputeSchema(t: ValidationTranslator) {
  return z.object({
    reason: z.enum(["payment_not_received", "payment_amount_mismatch", "service_not_as_described", "safety_concern", "other"]),
    description: z.string().min(DISPUTE_DESCRIPTION_MIN, t("descriptionMin")).max(DISPUTE_DESCRIPTION_MAX, t("descriptionMax")),
  })
}

export type DisputeFormValues = z.output<ReturnType<typeof buildDisputeSchema>>
export type DisputeActionState = { error?: string; success?: boolean }
