"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { sendPhoneVerificationCode, verifyPhoneVerificationCode } from "@/features/profile/actions"

export function PhoneVerification({ phone, verified }: { phone: string | null; verified: boolean }) {
  const t = useTranslations("Profile.phone")
  const [isPending, startTransition] = useTransition()
  const [pendingPhone, setPendingPhone] = useState<string | null>(null)
  const [code, setCode] = useState("")

  if (!phone) return null

  if (verified && pendingPhone === null) {
    return (
      <Badge variant="success" className="w-fit">
        <ShieldCheck className="size-3.5" aria-hidden="true" /> {t("verified")}
      </Badge>
    )
  }

  function onSend() {
    startTransition(async () => {
      const result = await sendPhoneVerificationCode()
      if (result.error) {
        toast.error(result.error)
        return
      }
      setPendingPhone(result.phone ?? phone)
      toast.success(t("codeSentTitle"))
    })
  }

  function onVerify() {
    if (!pendingPhone) return
    startTransition(async () => {
      const result = await verifyPhoneVerificationCode(pendingPhone, code)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(t("verifySuccess"))
      setPendingPhone(null)
      setCode("")
    })
  }

  if (pendingPhone) {
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel htmlFor="phone-otp">{t("codeLabel")}</FieldLabel>
          <Input
            id="phone-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Button type="button" size="sm" onClick={onVerify} disabled={isPending || code.length === 0}>
          {t("confirmCta")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPendingPhone(null)} disabled={isPending}>
          {t("cancelCta")}
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onSend} disabled={isPending}>
      {t("verifyCta")}
    </Button>
  )
}
