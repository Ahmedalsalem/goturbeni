"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Bell, BellOff, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createSearchAlert, deleteSearchAlert } from "@/features/search-alerts/actions"

export function SearchAlertToggle({
  departureCity,
  arrivalCity,
  initiallySubscribed,
}: {
  departureCity: string
  arrivalCity: string
  initiallySubscribed: boolean
}) {
  const t = useTranslations("SearchAlerts")
  const [subscribed, setSubscribed] = useState(initiallySubscribed)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = subscribed
        ? await deleteSearchAlert(departureCity, arrivalCity)
        : await createSearchAlert(departureCity, arrivalCity)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      setSubscribed(!subscribed)
      toast.success(subscribed ? t("unsubscribed") : t("subscribed"))
    })
  }

  return (
    <Button variant={subscribed ? "outline" : "default"} size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : subscribed ? (
        <BellOff className="size-4" aria-hidden="true" />
      ) : (
        <Bell className="size-4" aria-hidden="true" />
      )}
      {subscribed ? t("unsubscribe") : t("subscribe")}
    </Button>
  )
}
