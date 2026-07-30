"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, Eye, Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { adminSetDisputeStatus } from "@/features/disputes/actions"
import type { DisputeStatus } from "@/types/dispute"

// Admin queue action row — lets an admin move a dispute open -> in_review,
// then close it as resolved or dismissed with an optional note. Mirrors
// RejectRefundButton's inline-textarea pattern (features/admin/RejectRefundButton.tsx).
export function AdminDisputeResolveActions({ disputeId, status }: { disputeId: string; status: DisputeStatus }) {
  const t = useTranslations("Admin.disputes")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState("")

  function setStatus(nextStatus: DisputeStatus) {
    startTransition(async () => {
      const result = await adminSetDisputeStatus(disputeId, nextStatus, note.trim() || undefined)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("statusUpdated"))
        router.refresh()
      }
    })
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 sm:w-72">
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("resolutionNotePlaceholder")}
        className="min-h-16 text-sm"
        disabled={isPending}
      />
      <div className="flex flex-wrap justify-end gap-2">
        {status === "open" && (
          <Button size="sm" variant="outline" onClick={() => setStatus("in_review")} disabled={isPending}>
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            {t("startReview")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setStatus("dismissed")} disabled={isPending}>
          <X className="size-4" aria-hidden="true" />
          {t("dismiss")}
        </Button>
        <Button size="sm" onClick={() => setStatus("resolved")} disabled={isPending}>
          <Check className="size-4" aria-hidden="true" />
          {t("resolve")}
        </Button>
      </div>
    </div>
  )
}
