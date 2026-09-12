"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { Loader2, MailPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { adminResendVerificationCode } from "@/features/admin/actions"

export function ResendVerificationButton({ userId }: { userId: string }) {
  const t = useTranslations("Admin.users")
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await adminResendVerificationCode(userId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success(t("resendVerificationSuccess"))
      }
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MailPlus className="size-4" aria-hidden="true" />}
      {t("resendVerification")}
    </Button>
  )
}
