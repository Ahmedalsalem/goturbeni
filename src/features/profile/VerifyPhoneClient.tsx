"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MAX_PHONE_LENGTH } from "@/features/auth/schemas"
import {
  completeMandatoryProfileDetails,
  sendPhoneVerificationCode,
  verifyPhoneVerificationCode,
} from "@/features/profile/actions"

const GENDER_OPTIONS = ["female", "male"] as const
type Gender = (typeof GENDER_OPTIONS)[number]

// Drives the mandatory one-time verification gate on /verify-phone. Legacy
// accounts missing gender/phone (created before this requirement) fill them
// in first; everyone else goes straight to the OTP send/verify step, reusing
// the same server actions as the optional profile-page flow
// (features/profile/PhoneVerification.tsx).
export function VerifyPhoneClient({ gender, phone }: { gender: Gender | null; phone: string | null }) {
  const t = useTranslations("VerifyPhone")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingPhone, setPendingPhone] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [detailsMissing, setDetailsMissing] = useState(!gender || !phone)

  function onSubmitDetails(formData: FormData) {
    const selectedGender = formData.get("gender") as Gender | null
    const enteredPhone = formData.get("phone") as string | null
    if (!selectedGender || !enteredPhone) return

    startTransition(async () => {
      const result = await completeMandatoryProfileDetails(selectedGender, enteredPhone)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDetailsMissing(false)
      setPendingPhone(result.phone ?? enteredPhone)
      toast.success(t("codeSentTitle"))
    })
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
      router.push("/rides")
    })
  }

  if (detailsMissing) {
    return (
      <form action={onSubmitDetails} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="phone">{t("phoneLabel")}</FieldLabel>
            <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={MAX_PHONE_LENGTH} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="gender">{t("genderLabel")}</FieldLabel>
            <Select name="gender" required>
              <SelectTrigger id="gender" aria-label={t("genderLabel")} className="w-full">
                <SelectValue placeholder={t("genderPlaceholder")}>
                  {(value: Gender | null) => (value ? t(`genderOptions.${value}`) : t("genderPlaceholder"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`genderOptions.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {t("continueCta")}
        </Button>
      </form>
    )
  }

  if (pendingPhone) {
    return (
      <div className="flex flex-col gap-4">
        <Field>
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
        <Button type="button" onClick={onVerify} disabled={isPending || code.length === 0}>
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
          {t("confirmCta")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onSend} disabled={isPending}>
          {t("resendCta")}
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" className="w-full" onClick={onSend} disabled={isPending}>
      {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {t("sendCta")}
    </Button>
  )
}
