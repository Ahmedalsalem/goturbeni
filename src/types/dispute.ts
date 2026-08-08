export type DisputeReason = "payment_not_received" | "payment_amount_mismatch" | "service_not_as_described" | "safety_concern" | "other" | "no_show"
// "no_show" is system-generated only (report_no_show, 0056) — the manual
// "report a problem" form (OpenDisputeButton/schemas.ts) never lets a user
// pick it, so it's excluded here rather than added to that form's options.
export type ManualDisputeReason = Exclude<DisputeReason, "no_show">
export type DisputeStatus = "open" | "in_review" | "resolved" | "dismissed"

export interface Dispute {
  id: string
  booking_id: string
  opened_by: string
  against_user_id: string
  reason: DisputeReason
  description: string
  status: DisputeStatus
  resolution_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface DisputeWithParties extends Dispute {
  opened_by_profile: { full_name: string | null } | null
  against_user_profile: { full_name: string | null } | null
  booking: {
    ride: { departure_city: string; arrival_city: string; departure_time: string }
  }
}
