"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"
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
    // 23505 = unique_violation — reviews_one_per_reviewer_per_reviewee_per_ride.
    // Any other failure here is the "insert own review" RLS check rejecting
    // the row (not completed yet, no approved booking, or self-review attempt).
    if (error.code !== "23505") {
      logError(error, "reviews.createReview")
    }
    return { error: error.code === "23505" ? tErrors("alreadyReviewed") : tErrors("notEligible") }
  }

  revalidatePath(`/rides/${rideId}`)
  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  revalidatePath("/profile")
  return { success: true }
}

// Reviewer-only edit, within the 15-minute window enforced by the edit_review
// RPC (see supabase/migrations/0013_editable_messages_reviews.sql). No rate
// limit here (unlike createReview): edits are bounded by the fixed window per
// review and serialized by the RPC's row lock.
export async function updateReview(reviewId: string, rideId: string, values: ReviewFormValues): Promise<ReviewActionState> {
  const { schema, tErrors } = await getReviewTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("edit_review", {
    p_review_id: reviewId,
    p_new_rating: parsed.data.rating,
    p_new_comment: parsed.data.comment ?? null,
  })

  if (error) {
    const expired = error.message.includes("edit_window_expired")
    if (!expired) {
      logError(error, "reviews.updateReview")
    }
    return { error: expired ? tErrors("editWindowExpired") : tErrors("actionFailed") }
  }

  revalidatePath(`/rides/${rideId}`)
  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  revalidatePath("/profile")
  return { success: true }
}

// Reviewer-only soft delete, same 15-minute window as updateReview. The row
// itself is kept (see soft_delete_review) but getReviewStats/getReviewsForUser
// exclude it once deleted_at is set — a deleted review no longer counts
// toward the reviewee's average rating or review count.
export async function deleteReview(reviewId: string, rideId: string): Promise<ReviewActionState> {
  const { tErrors } = await getReviewTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("soft_delete_review", { p_review_id: reviewId })

  if (error) {
    const expired = error.message.includes("edit_window_expired")
    if (!expired) {
      logError(error, "reviews.deleteReview")
    }
    return { error: expired ? tErrors("editWindowExpired") : tErrors("actionFailed") }
  }

  revalidatePath(`/rides/${rideId}`)
  revalidatePath("/bookings")
  revalidatePath(`/rides/${rideId}/bookings`)
  revalidatePath("/profile")
  return { success: true }
}
