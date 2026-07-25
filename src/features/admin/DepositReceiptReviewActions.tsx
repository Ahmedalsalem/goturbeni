"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { reviewDepositReceipt } from "@/features/admin/actions"

export function DepositReceiptReviewActions({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Admin.payments")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function review(approved: boolean) {
    startTransition(async () => {
      const result = await reviewDepositReceipt(bookingId, approved)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(approved ? t("receiptApproved") : t("receiptRejected"))
        router.refresh()
      }
    })
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => review(false)} disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
        {t("reject")}
      </Button>
      <Button size="sm" onClick={() => review(true)} disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
        {t("approve")}
      </Button>
    </div>
  )
}
