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
  if (!checkRateLimit(`send-message:${user.id}`, SEND_MESSAGE_RATE_LIMIT.limit, SEND_MESSAGE_RATE_LIMIT.windowMs)) {
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
