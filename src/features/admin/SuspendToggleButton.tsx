"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { setSuspended } from "@/features/admin/actions"

export function SuspendToggleButton({ userId, isSuspended }: { userId: string; isSuspended: boolean }) {
  const t = useTranslations("Admin.users")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    startTransition(async () => {
      const result = await setSuspended(userId, !isSuspended)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(isSuspended ? t("unsuspendSuccess") : t("suspendSuccess"))
        router.refresh()
      }
      setConfirming(false)
    })
  }

  return (
    <Button variant={confirming ? "destructive" : "outline"} size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : isSuspended ? (
        <ShieldCheck className="size-4" aria-hidden="true" />
      ) : (
        <ShieldAlert className="size-4" aria-hidden="true" />
      )}
      {confirming ? t("confirmToggle") : isSuspended ? t("unsuspend") : t("suspend")}
    </Button>
  )
}
