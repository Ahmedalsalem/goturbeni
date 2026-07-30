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
import { buildDisputeSchema, type DisputeActionState, type DisputeFormValues } from "@/features/disputes/schemas"
import type { DisputeStatus } from "@/types/dispute"

const OPEN_DISPUTE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 }

async function getDisputeTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Disputes.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Disputes.errors" })
  return { schema: buildDisputeSchema(tValidation), tErrors }
}

// Passenger or driver on a booking reports a problem — open_dispute
// (0044_disputes.sql) figures out who the complaint is against from the
// caller's role on the booking and raises 'not_authorized' for anyone else.
export async function openDispute(bookingId: string, values: DisputeFormValues): Promise<DisputeActionState> {
  const { schema, tErrors } = await getDisputeTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  if (!(await checkRateLimit(`open-dispute:${user.id}`, OPEN_DISPUTE_RATE_LIMIT.limit, OPEN_DISPUTE_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("open_dispute", {
    p_booking_id: bookingId,
    p_reason: parsed.data.reason,
    p_description: parsed.data.description,
  })

  if (error) {
    if (error.message.includes("dispute_already_open")) {
      return { error: tErrors("alreadyOpen") }
    }
    if (error.message.includes("not_authorized") || error.message.includes("booking_not_found")) {
      return { error: tErrors("notAuthorized") }
    }
    logError(error, "disputes.openDispute")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/bookings")
  revalidatePath("/rides")
  return { success: true }
}

// admin_set_dispute_status is the sole enforcement point (0044_disputes.sql) —
// same authorization shape as the other admin RPC wrappers in
// features/admin/actions.ts.
export async function adminSetDisputeStatus(disputeId: string, status: DisputeStatus, resolutionNote?: string): Promise<DisputeActionState> {
  const locale = await getUserLocale()
  const tErrors = await getTranslations({ locale, namespace: "Disputes.errors" })
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_set_dispute_status", {
    p_dispute_id: disputeId,
    p_status: status,
    p_resolution_note: resolutionNote ?? null,
  })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    logError(error, "disputes.adminSetDisputeStatus")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/disputes")
  return { success: true }
}
