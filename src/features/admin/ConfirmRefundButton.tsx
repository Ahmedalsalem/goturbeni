"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { confirmRefund } from "@/features/admin/actions"

export function ConfirmRefundButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Admin.payments")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await confirmRefund(bookingId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("refundConfirmed"))
        router.refresh()
      }
    })
  }

  return (
    <Button size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
      {t("confirmRefund")}
    </Button>
  )
}
