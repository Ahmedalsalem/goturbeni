"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { openDispute } from "@/features/disputes/actions"
import type { ManualDisputeReason } from "@/types/dispute"

const DISPUTE_REASONS: ManualDisputeReason[] = ["payment_not_received", "payment_amount_mismatch", "service_not_as_described", "safety_concern", "other"]

// Lets either party on a booking (passenger or driver) formally report a
// problem — open_dispute (0044_disputes.sql) works out who the complaint is
// against from the caller's role. Mirrors RejectRefundButton's
// expand-inline-form pattern rather than a full dialog.
export function OpenDisputeButton({ bookingId, alreadyOpen }: { bookingId: string; alreadyOpen: boolean }) {
  const t = useTranslations("Disputes.form")
  const tSuccess = useTranslations("Disputes.success")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [reason, setReason] = useState<ManualDisputeReason>("payment_not_received")
  const [description, setDescription] = useState("")

  if (alreadyOpen) {
    return (
      <Button size="sm" variant="secondary" disabled>
        <TriangleAlert className="size-4" aria-hidden="true" />
        {t("alreadyOpenBadge")}
      </Button>
    )
  }

  function onSubmit() {
    startTransition(async () => {
      const result = await openDispute(bookingId, { reason, description })
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(tSuccess("opened"))
        setExpanded(false)
        setDescription("")
        router.refresh()
      }
    })
  }

  if (!expanded) {
    return (
      <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
        <TriangleAlert className="size-4" aria-hidden="true" />
        {t("reportProblem")}
      </Button>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-2 sm:w-80">
      <Select value={reason} onValueChange={(value) => setReason(value as ManualDisputeReason)}>
        <SelectTrigger aria-label={t("reasonLabel")}>
          <SelectValue>{(value: ManualDisputeReason) => t(`reason.${value}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {DISPUTE_REASONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`reason.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t("descriptionPlaceholder")}
        className="min-h-20 text-sm"
        disabled={isPending}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setExpanded(false)} disabled={isPending}>
          {t("cancel")}
        </Button>
        <Button size="sm" variant="outline" onClick={onSubmit} disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {t("submit")}
        </Button>
      </div>
    </div>
  )
}
