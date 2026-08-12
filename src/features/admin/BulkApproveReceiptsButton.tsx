"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCheck, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { adminBulkApproveReceipts } from "@/features/admin/actions"

// Sits above the "low risk" tier of a receipt list — collapses N individual
// approve clicks into one. Still a single explicit admin action (not
// unattended auto-approval): every row still gets *_reviewed_at stamped by
// admin_bulk_approve_receipts (0047_bulk_receipt_review.sql).
export function BulkApproveReceiptsButton({ bookingIds }: { bookingIds: string[] }) {
  const t = useTranslations("Admin.payments")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await adminBulkApproveReceipts(bookingIds)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("bulkApproveSuccess", { count: result.approvedCount ?? 0 }))
        router.refresh()
      }
    })
  }

  return (
    <Button size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="size-4" aria-hidden="true" />}
      {t("bulkApprove", { count: bookingIds.length })}
    </Button>
  )
}
