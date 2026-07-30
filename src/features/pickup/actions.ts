"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { checkRateLimit } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { buildVerifyPickupCodeSchema, type PickupActionState, type VerifyPickupCodeValues } from "@/features/pickup/schemas"

// Keyed per-booking rather than per-driver: a 4-digit code only has 10,000
// combinations, so this bounds guessing on any single booking regardless of
// which driver account is calling (verify_pickup_code itself already
// restricts callers to that ride's driver — this is defense in depth, same
// convention as every other mutating action in this codebase).
const VERIFY_PICKUP_CODE_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 }

async function getPickupTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Pickup.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Pickup.errors" })
  return { schema: buildVerifyPickupCodeSchema(tValidation), tErrors }
}

// Driver enters the code the passenger read off their own screen — sole
// enforcement point is verify_pickup_code (0048_pickup_verification_code.sql),
// which checks auth.uid() = ride.driver_id and compares the code server-side.
export async function verifyPickupCode(bookingId: string, rideId: string, values: VerifyPickupCodeValues): Promise<PickupActionState> {
  const { schema, tErrors } = await getPickupTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  await verifySession()
  if (!(await checkRateLimit(`verify-pickup:${bookingId}`, VERIFY_PICKUP_CODE_RATE_LIMIT.limit, VERIFY_PICKUP_CODE_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("verify_pickup_code", { p_booking_id: bookingId, p_code: parsed.data.code })

  if (error) {
    if (error.message.includes("invalid_code")) {
      return { error: tErrors("invalidCode") }
    }
    if (error.message.includes("already_verified")) {
      return { error: tErrors("alreadyVerified") }
    }
    if (error.message.includes("booking_not_approved")) {
      return { error: tErrors("bookingNotApproved") }
    }
    if (error.message.includes("not_ride_driver") || error.message.includes("booking_not_found") || error.message.includes("no_pickup_code")) {
      return { error: tErrors("notAuthorized") }
    }
    logError(error, "pickup.verifyPickupCode")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath(`/rides/${rideId}/bookings`)
  return { success: true }
}
