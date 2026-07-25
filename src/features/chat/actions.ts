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
import { sendPushNotification } from "@/lib/notifications"
import { buildMessageSchema, type ChatActionState, type MessageFormValues } from "@/features/chat/schemas"

const SEND_MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 }

async function getChatTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Chat.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Chat.errors" })
  return { schema: buildMessageSchema(tValidation), tErrors }
}

export async function sendMessage(rideId: string, receiverId: string, values: MessageFormValues): Promise<ChatActionState> {
  const { schema, tErrors } = await getChatTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  if (!(await checkRateLimit(`send-message:${user.id}`, SEND_MESSAGE_RATE_LIMIT.limit, SEND_MESSAGE_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("messages").insert({
    ride_id: rideId,
    sender_id: user.id,
    receiver_id: receiverId,
    message: parsed.data.message,
  })

  if (error) {
    logError(error, "chat.sendMessage")
    return { error: tErrors("sendFailed") }
  }

  await sendPushNotification({ type: "new_message", recipientId: receiverId, rideId })

  revalidatePath(`/rides/${rideId}/chat`)
  return { success: true }
}

// Shares the sender's current GPS position as a chat message (message_type =
// 'location', see supabase/migrations/0019_chat_location_sharing.sql). The
// `message` column still gets a human-readable caption — displayed by
// clients that don't special-case message_type, and by push notifications —
// while location_lat/location_lng carry the actual coordinates.
export async function sendLocationMessage(rideId: string, receiverId: string, lat: number, lng: number): Promise<ChatActionState> {
  const { tErrors } = await getChatTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: tErrors("invalidForm") }
  }

  const locale = await getUserLocale()
  const tChat = await getTranslations({ locale, namespace: "Chat" })

  const user = await verifySession()
  if (!(await checkRateLimit(`send-message:${user.id}`, SEND_MESSAGE_RATE_LIMIT.limit, SEND_MESSAGE_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }

  const supabase = await createClient()
  const { error } = await supabase.from("messages").insert({
    ride_id: rideId,
    sender_id: user.id,
    receiver_id: receiverId,
    message: tChat("locationShared"),
    message_type: "location",
    location_lat: lat,
    location_lng: lng,
  })

  if (error) {
    logError(error, "chat.sendLocationMessage")
    return { error: tErrors("sendFailed") }
  }

  await sendPushNotification({ type: "new_message", recipientId: receiverId, rideId })

  revalidatePath(`/rides/${rideId}/chat`)
  return { success: true }
}

// Sender-only edit, within the 15-minute window enforced by the edit_message
// RPC (see supabase/migrations/0013_editable_messages_reviews.sql). No rate
// limit here (unlike sendMessage): edits are bounded by the fixed window per
// message and serialized by the RPC's row lock, so the abuse surface is much
// smaller than unbounded message creation.
export async function editMessage(rideId: string, messageId: string, newText: string): Promise<ChatActionState> {
  const { schema, tErrors } = await getChatTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse({ message: newText })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("edit_message", { p_message_id: messageId, p_new_text: parsed.data.message })

  if (error) {
    const expired = error.message.includes("edit_window_expired")
    if (!expired) {
      logError(error, "chat.editMessage")
    }
    return { error: expired ? tErrors("editWindowExpired") : tErrors("actionFailed") }
  }

  revalidatePath(`/rides/${rideId}/chat`)
  return { success: true }
}

// Sender-only soft delete, same 15-minute window as editMessage. The row
// itself is kept (see soft_delete_message) — MessageBubble renders a
// placeholder once message.deleted_at is set.
export async function deleteMessage(rideId: string, messageId: string): Promise<ChatActionState> {
  const { tErrors } = await getChatTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.rpc("soft_delete_message", { p_message_id: messageId })

  if (error) {
    const expired = error.message.includes("edit_window_expired")
    if (!expired) {
      logError(error, "chat.deleteMessage")
    }
    return { error: expired ? tErrors("editWindowExpired") : tErrors("actionFailed") }
  }

  revalidatePath(`/rides/${rideId}/chat`)
  return { success: true }
}

// Called by ChatWindow whenever the counterpart's unread messages come into
// view — flips read_at so the sender's bubble shows a "seen" indicator.
// Covered by the "update own received message" RLS policy (0004_messages.sql).
export async function markMessagesRead(rideId: string, senderId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return
  }
  const user = await verifySession()
  const supabase = await createClient()
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("ride_id", rideId)
    .eq("sender_id", senderId)
    .eq("receiver_id", user.id)
    .is("read_at", null)
}
