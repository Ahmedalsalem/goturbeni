"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { StarRatingInput } from "@/features/reviews/StarRatingInput"
import { createReview } from "@/features/reviews/actions"
import {
  buildReviewSchema,
  MAX_COMMENT_LENGTH,
  MIN_RATING,
  type ReviewFormInput,
  type ReviewFormValues,
} from "@/features/reviews/schemas"

export function ReviewForm({ rideId, revieweeId }: { rideId: string; revieweeId: string }) {
  const t = useTranslations("Reviews.form")
  const tValidation = useTranslations("Reviews.validation")
  const tSuccess = useTranslations("Reviews.success")
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReviewFormInput, unknown, ReviewFormValues>({
    resolver: zodResolver(buildReviewSchema(tValidation)),
    defaultValues: { rating: MIN_RATING, comment: undefined },
  })

  async function onSubmit(values: ReviewFormValues) {
    setServerError(null)
    const result = await createReview(rideId, revieweeId, values)
    if (result?.error) {
      setServerError(result.error)
    } else {
      toast.success(tSuccess("created"))
      setSubmitted(true)
      router.refresh()
    }
  }

  if (submitted) {
    return null
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel>{t("ratingLabel")}</FieldLabel>
          <Controller
            control={control}
            name="rating"
            render={({ field }) => <StarRatingInput value={field.value as number} onChange={field.onChange} label={t("ratingLabel")} />}
          />
          {errors.rating && <FieldError errors={[{ message: errors.rating.message }]} />}
        </Field>

        <Field>
          <FieldLabel htmlFor="review-comment">{t("commentLabel")}</FieldLabel>
          <Textarea id="review-comment" rows={3} maxLength={MAX_COMMENT_LENGTH} {...register("comment")} />
          <FieldDescription>{t("commentHint")}</FieldDescription>
          {errors.comment && <FieldError errors={[{ message: errors.comment.message }]} />}
        </Field>
      </FieldGroup>

      <Button type="submit" size="sm" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {t("submit")}
      </Button>
    </form>
  )
}
