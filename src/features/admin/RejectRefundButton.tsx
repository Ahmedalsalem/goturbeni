"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { rejectRefundProof } from "@/features/admin/actions"

// Sibling to ConfirmRefundButton — puts the refund back to 'pending' (driver
// re-uploads via submitRefundProof) instead of confirming it.
export function RejectRefundButton({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Admin.payments")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState("")

  function onReject() {
    startTransition(async () => {
      const result = await rejectRefundProof(bookingId, reason.trim() || undefined)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("receiptRejected"))
        setShowReject(false)
        setReason("")
        router.refresh()
      }
    })
  }

  if (showReject) {
    return (
      <div className="flex w-64 flex-col gap-2">
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("rejectReasonPlaceholder")}
          className="min-h-14 text-sm"
          disabled={isPending}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowReject(false)} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <X className="size-4" aria-hidden="true" />}
            {t("confirmReject")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={() => setShowReject(true)} disabled={isPending}>
      <X className="size-4" aria-hidden="true" />
      {t("reject")}
    </Button>
  )
}
