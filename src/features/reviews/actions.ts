"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { buildReviewSchema, type ReviewActionState, type ReviewFormValues } from "@/features/reviews/schemas"

async function getReviewTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Reviews.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Reviews.errors" })
  return { schema: buildReviewSchema(tValidation), tErrors }
}

export async function createReview(rideId: string, revieweeId: string, values: ReviewFormValues): Promise<ReviewActionState> {
  const { schema, tErrors } = await getReviewTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("reviews").insert({
    ride_id: rideId,
    reviewer_id: user.id,
    reviewed_user_id: revieweeId,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  })

  if (error) {
    // 23505 = unique_violation — reviews_one_per_reviewer_per_ride. Any other
    // failure here is the "insert own review" RLS check rejecting the row
    // (not completed yet, no approved booking, or self-review attempt).
    return { error: error.code === "23505" ? tErrors("alreadyReviewed") : tErrors("notEligible") }
  }

  revalidatePath(`/rides/${rideId}`)
  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  revalidatePath("/profile")
  return { success: true }
}
