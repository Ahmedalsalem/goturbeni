"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { subscribeToPush } from "@/features/push/actions"
import { logError } from "@/lib/logger"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const AUTO_PROMPT_STORAGE_KEY = "push-permission-auto-prompted"

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

// Notifications can only be turned ON from inside the app. Once granted,
// there is deliberately no in-app "disable" path — turning them back off is
// left entirely to the browser/OS notification settings (see manageInSettings
// below), so this component only ever moves subscribed from false -> true.
export function PushNotificationToggle() {
  const t = useTranslations("Push")
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [isPending, setIsPending] = useState(false)

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!VAPID_PUBLIC_KEY) return false
    const registration = await navigator.serviceWorker.ready

    const permission = await Notification.requestPermission()
    if (permission !== "granted") {
      return false
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
    return !result.error
  }, [])

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      // Most common real-world case: iOS Safari, which only exposes the Push
      // API once the site has been added to the home screen — there's no
      // permission step to retry here, so surface *why* instead of just
      // disappearing (a bare `return null` looks like a bug from the outside).
      return
    }
    setSupported(true)

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        setSubscribed(subscription !== null)

        // Ask once, automatically, the first time this browser has a signed-in
        // session — instead of requiring the user to find and tap the bell.
        // Only fires while permission is still in its default (unasked) state;
        // a prior "denied" is never retried automatically (the browser would
        // ignore the call anyway), and it never fires again once we've tried.
        if (
          subscription === null &&
          Notification.permission === "default" &&
          window.localStorage.getItem(AUTO_PROMPT_STORAGE_KEY) !== "1"
        ) {
          window.localStorage.setItem(AUTO_PROMPT_STORAGE_KEY, "1")
          subscribe()
            .then((granted) => setSubscribed(granted))
            .catch((error) => logError(error, "push.autoPrompt"))
        }
      })
      .catch((error) => logError(error, "push.checkSubscription"))
  }, [subscribe])

  async function onClick() {
    if (!supported) {
      toast.error(t("unsupported"))
      return
    }
    if (subscribed) {
      toast.info(t("manageInSettings"))
      return
    }
    setIsPending(true)
    try {
      const granted = await subscribe()
      if (!granted) {
        toast.error(Notification.permission === "denied" ? t("permissionDenied") : t("subscribeError"))
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

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={supported ? (subscribed ? t("enabledLabel") : t("enable")) : t("unsupported")}
      onClick={onClick}
      disabled={isPending}
      className={!supported ? "opacity-40" : undefined}
    >
      {supported && subscribed ? (
        <Bell className="size-4" aria-hidden="true" />
      ) : (
        <BellOff className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}
