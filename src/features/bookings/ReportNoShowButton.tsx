"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, UserX } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { reportNoShow } from "@/features/bookings/actions"

// Shown on a completed, approved booking row once the ride has departed —
// mirrors CancelBookingButton's two-click confirm pattern. Reporting only
// feeds the admin-side suspicious-account rules (0042_suspicious_accounts_no_show_rules.sql);
// there's no immediate visible effect for the reporter or the reported party.
export function ReportNoShowButton({ bookingId, rideId, label }: { bookingId: string; rideId: string; label: string }) {
  const t = useTranslations("Bookings.actions")
  const tSuccess = useTranslations("Bookings.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await reportNoShow(bookingId, rideId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("noShowReported"))
        router.refresh()
      }
      setConfirming(false)
    })
  }

  return (
    <Button variant={confirming ? "destructive" : "outline"} size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserX className="size-4" aria-hidden="true" />}
      {confirming ? t("confirmNoShow") : label}
    </Button>
  )
}
