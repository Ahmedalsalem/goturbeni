"use client"

import { useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

// Shared by SettlementReceiptUpload (passenger -> driver's IBAN, post-trip)
// and RefundProofUpload (driver -> passenger, after a cancelled/paid
// booking) — both just need a file picker that posts to a server action
// returning { error? }.
export function ReceiptUploadForm({
  action,
  label,
}: {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
  label: string
}) {
  const t = useTranslations("Bookings.payment")
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.set("receipt", file)
    startTransition(async () => {
      const result = await action(formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("receiptUploadSuccess"))
        router.refresh()
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    })
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={onFileChange}
        disabled={isPending}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
        {label}
      </Button>
    </div>
  )
}
