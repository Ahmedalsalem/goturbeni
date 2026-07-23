"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { subscribeToPush, unsubscribeFromPush } from "@/features/push/actions"
import { logError } from "@/lib/logger"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function PushNotificationToggle() {
  const t = useTranslations("Push")
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return
    }
    setSupported(true)
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(subscription !== null))
      .catch((error) => logError(error, "push.checkSubscription"))
  }, [])

  async function onToggle() {
    if (!VAPID_PUBLIC_KEY) return
    setIsPending(true)
    try {
      const registration = await navigator.serviceWorker.ready

      if (subscribed) {
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const endpoint = subscription.endpoint
          await subscription.unsubscribe()
          await unsubscribeFromPush(endpoint)
        }
        setSubscribed(false)
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        toast.error(t("permissionDenied"))
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("incomplete_push_subscription")
      }

      const result = await subscribeToPush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      })
      if (result.error) {
        toast.error(t("subscribeError"))
        return
      }
      setSubscribed(true)
    } catch (error) {
      logError(error, "push.toggle")
      toast.error(t("subscribeError"))
    } finally {
      setIsPending(false)
    }
  }

  if (!supported) return null

  return (
    <Button variant="ghost" size="icon" aria-label={subscribed ? t("disable") : t("enable")} onClick={onToggle} disabled={isPending}>
      {subscribed ? <Bell className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
    </Button>
  )
}
