"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"

export interface AdminActionState {
  error?: string
  success?: boolean
}

async function getAdminErrorTranslator() {
  const locale = await getUserLocale()
  return getTranslations({ locale, namespace: "Admin.errors" })
}

// Authorization lives entirely in the admin_set_suspended RPC (security
// definer, raises 'not_admin'/'cannot_suspend_self' — see
// supabase/migrations/0014_admin.sql). verifySession() here only confirms
// the caller is a logged-in, non-suspended user; it does not itself check
// is_admin, so a non-admin invoking this action directly still hits the
// RPC's own guard and fails.
export async function setSuspended(userId: string, suspended: boolean): Promise<AdminActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_set_suspended", { p_user_id: userId, p_suspended: suspended })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    if (error.message.includes("cannot_suspend_self")) {
      return { error: tErrors("cannotSuspendSelf") }
    }
    logError(error, "admin.setSuspended")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/users")
  return { success: true }
}

// Same authorization shape as setSuspended — admin_cancel_ride is the sole
// enforcement point (raises 'not_admin'/'ride_not_cancellable').
export async function cancelRideAsAdmin(rideId: string): Promise<AdminActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_cancel_ride", { p_ride_id: rideId })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    if (error.message.includes("ride_not_cancellable")) {
      return { error: tErrors("rideNotCancellable") }
    }
    logError(error, "admin.cancelRideAsAdmin")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/rides")
  return { success: true }
}

// Same authorization shape as the others — admin_review_deposit_receipt is
// the sole enforcement point (0020_payment_receipts.sql, reason param added
// in 0025_settlement_receipts_and_reject_reasons.sql).
export async function reviewDepositReceipt(bookingId: string, approved: boolean, reason?: string): Promise<AdminActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_review_deposit_receipt", { p_booking_id: bookingId, p_approved: approved, p_reason: reason ?? null })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    logError(error, "admin.reviewDepositReceipt")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/payments")
  return { success: true }
}

// Same authorization shape — admin_review_settlement_receipt is the sole
// enforcement point (0025_settlement_receipts_and_reject_reasons.sql).
export async function reviewSettlementReceipt(bookingId: string, approved: boolean, reason?: string): Promise<AdminActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_review_settlement_receipt", { p_booking_id: bookingId, p_approved: approved, p_reason: reason ?? null })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    logError(error, "admin.reviewSettlementReceipt")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/payments")
  return { success: true }
}

// admin_confirm_refund is the sole enforcement point (0021_cancellation_refunds.sql).
export async function confirmRefund(bookingId: string): Promise<AdminActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_confirm_refund", { p_booking_id: bookingId })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    logError(error, "admin.confirmRefund")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/payments")
  return { success: true }
}

// admin_reject_refund_proof is the sole enforcement point
// (0025_settlement_receipts_and_reject_reasons.sql) — puts refund_status
// back to 'pending' so the driver can re-upload via submitRefundProof.
export async function rejectRefundProof(bookingId: string, reason?: string): Promise<AdminActionState> {
  const tErrors = await getAdminErrorTranslator()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_reject_refund_proof", { p_booking_id: bookingId, p_reason: reason ?? null })

  if (error) {
    if (error.message.includes("not_admin")) {
      return { error: tErrors("notAdmin") }
    }
    logError(error, "admin.rejectRefundProof")
    return { error: tErrors("actionFailed") }
  }

  revalidatePath("/admin/payments")
  return { success: true }
}
