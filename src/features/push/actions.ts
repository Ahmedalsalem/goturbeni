"use server"

import { createClient } from "@/lib/supabase/server"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export async function subscribeToPush(subscription: PushSubscriptionInput): Promise<{ error?: string }> {
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "endpoint" }
  )
  if (error) {
    logError(error, "push.subscribeToPush")
    return { error: "subscribe_failed" }
  }
  return {}
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ error?: string }> {
  await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint)
  if (error) {
    logError(error, "push.unsubscribeFromPush")
    return { error: "unsubscribe_failed" }
  }
  return {}
}
