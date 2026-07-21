import { z } from "zod"

export const MIN_RATING = 1
export const MAX_RATING = 5
export const MAX_COMMENT_LENGTH = 500

type ValidationTranslator = (key: "ratingRequired" | "commentMax") => string

export function buildReviewSchema(t: ValidationTranslator) {
  return z.object({
    rating: z.coerce.number().int().min(MIN_RATING, t("ratingRequired")).max(MAX_RATING, t("ratingRequired")),
    comment: z
      .string()
      .trim()
      .max(MAX_COMMENT_LENGTH, t("commentMax"))
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
}

export type ReviewFormValues = z.output<ReturnType<typeof buildReviewSchema>>
export type ReviewFormInput = z.input<ReturnType<typeof buildReviewSchema>>

export type ReviewActionState = { error?: string; success?: boolean }
