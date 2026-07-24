// Mirrors the 15-minute window enforced server-side by the edit_message /
// soft_delete_message / edit_review / soft_delete_review RPCs (see
// supabase/migrations/0013_editable_messages_reviews.sql). This is UX-only —
// hiding the edit/delete affordance once the window closes — the RPC is the
// actual enforcement, so a stale client clock can't bypass it.
export const EDIT_WINDOW_MS = 15 * 60 * 1000

export function isWithinEditWindow(createdAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(createdAt).getTime() < EDIT_WINDOW_MS
}
