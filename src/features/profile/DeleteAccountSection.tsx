"use client"

import { useState, useTransition } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { deleteOwnAccount } from "@/features/profile/actions"

// Same two-step in-place confirm pattern as BookingActions (features/bookings/
// BookingActions.tsx) — click once to arm, click again to actually delete —
// rather than a separate dialog component.
export function DeleteAccountSection() {
  const t = useTranslations("Profile.form")
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await deleteOwnAccount()
      if (result?.error) {
        toast.error(result.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t("deleteAccountDescription")}</p>
      <Button type="button" variant="destructive" className="w-fit" onClick={onClick} disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-4" aria-hidden="true" />
        )}
        {confirming ? t("deleteAccountConfirm") : t("deleteAccountCta")}
      </Button>
    </div>
  )
}
