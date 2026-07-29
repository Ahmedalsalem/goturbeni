"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Bell, BellOff, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { joinRideWaitlist, leaveRideWaitlist } from "@/features/waitlist/actions"

export function WaitlistButton({ rideId, initiallyJoined }: { rideId: string; initiallyJoined: boolean }) {
  const t = useTranslations("Waitlist")
  const [joined, setJoined] = useState(initiallyJoined)
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = joined ? await leaveRideWaitlist(rideId) : await joinRideWaitlist(rideId, 1)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      setJoined(!joined)
      toast.success(joined ? t("left") : t("joined"))
    })
  }

  return (
    <Button variant={joined ? "outline" : "default"} size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : joined ? (
        <BellOff className="size-4" aria-hidden="true" />
      ) : (
        <Bell className="size-4" aria-hidden="true" />
      )}
      {joined ? t("leave") : t("join")}
    </Button>
  )
}
