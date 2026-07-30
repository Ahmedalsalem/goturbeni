// Rule-based triage for the admin payments queue — see
// "Receipt review: risk-tiered queue" for context. No OCR/bank-API
// verification exists anywhere in this project (README → Bilinen
// Sınırlamalar), so this can never confirm the uploaded receipt actually
// shows the right amount; it only estimates how much an admin should trust
// the *submitter*, based on signals already in the system. "Low" only
// fast-tracks the click (bulk-approve), it does not skip the paper trail —
// admin_bulk_approve_receipts still stamps *_reviewed_at and requires an
// explicit admin action.
export type ReceiptRiskTier = "low" | "high"

export const TRUSTED_ACCOUNT_MIN_AGE_DAYS = 14

export function computeReceiptRiskTier(params: {
  passengerId: string
  passengerCreatedAt: string
  passengerSuspended: boolean
  rejectCount: number
  suspiciousUserIds: Set<string>
  disputedUserIds: Set<string>
}): ReceiptRiskTier {
  const ageDays = (Date.now() - new Date(params.passengerCreatedAt).getTime()) / (24 * 60 * 60 * 1000)

  const trusted =
    ageDays >= TRUSTED_ACCOUNT_MIN_AGE_DAYS &&
    !params.passengerSuspended &&
    params.rejectCount === 0 &&
    !params.suspiciousUserIds.has(params.passengerId) &&
    !params.disputedUserIds.has(params.passengerId)

  return trusted ? "low" : "high"
}
