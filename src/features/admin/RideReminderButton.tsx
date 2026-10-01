"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { BellRing, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { sendRideReminderAsAdmin } from "@/features/admin/actions"

export function RideReminderButton({ rideId }: { rideId: string }) {
  const t = useTranslations("Admin.rides")
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await sendRideReminderAsAdmin(rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("remindSuccess", { count: result.recipientCount ?? 0 }))
      }
      setConfirming(false)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <BellRing className="size-4" aria-hidden="true" />}
      {confirming ? t("confirmRemind") : t("remind")}
    </Button>
  )
}
