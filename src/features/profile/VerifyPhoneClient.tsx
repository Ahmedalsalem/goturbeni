"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MAX_PHONE_LENGTH } from "@/features/auth/schemas"
import {
  completeMandatoryProfileDetails,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
} from "@/features/profile/actions"

const GENDER_OPTIONS = ["female", "male"] as const
type Gender = (typeof GENDER_OPTIONS)[number]

// Users resent the code within ~20s of the first send, before the first
// email had arrived. Each resend used to replace the code, so the code in the
// first email stopped working (fixed in 0105: a resend reuses the unexpired
// code). The countdown still gives the email time to arrive before the button
// can be pressed again.
const RESEND_COOLDOWN_SECONDS = 30

// Set after a successful send so a reload in the same tab shows the code
// input instead of sending another email.
const AUTO_SENT_STORAGE_KEY = "verify-code-auto-sent"

// Drives the mandatory one-time verification gate on /verify-phone. Legacy
// accounts missing gender/phone (created before this requirement) fill them
// in first; everyone else goes straight to the e-mail code send/verify step,
// reusing the same server actions as the optional profile-page flow
// (features/profile/PhoneVerification.tsx).
export function VerifyPhoneClient({ gender, phone }: { gender: Gender | null; phone: string | null }) {
  const t = useTranslations("VerifyPhone")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState("")
  const [detailsMissing, setDetailsMissing] = useState(!gender || !phone)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [autoSendPending, setAutoSendPending] = useState(!detailsMissing)

  // Users who reached this page used to see only a "send code" button, and
  // many left without pressing it. The first code now goes out on its own;
  // the button only remains as a retry if that send fails.
  const autoSendStarted = useRef(false)
  useEffect(() => {
    if (!autoSendPending || autoSendStarted.current) return
    autoSendStarted.current = true
    let alreadySent = false
    try {
      alreadySent = window.sessionStorage.getItem(AUTO_SENT_STORAGE_KEY) === "1"
    } catch {
      // Storage unavailable (private mode): send anyway, reloads may resend.
    }
    setAutoSendPending(false)
    if (alreadySent) {
      setCodeSent(true)
      return
    }
    onSend()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((seconds) => seconds - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

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
      try {
        window.sessionStorage.setItem(AUTO_SENT_STORAGE_KEY, "1")
      } catch {
        // Storage unavailable: a reload will send again.
      }
      setDetailsMissing(false)
      setCodeSent(true)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      toast.success(t("codeSentTitle"))
    })
  }

  function onSend() {
    startTransition(async () => {
      const result = await sendEmailVerificationCode()
      if (result.error) {
        toast.error(result.error)
        return
      }
      try {
        window.sessionStorage.setItem(AUTO_SENT_STORAGE_KEY, "1")
      } catch {
        // Storage unavailable: a reload will send again.
      }
      setCodeSent(true)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      toast.success(t("codeSentTitle"))
    })
  }

  function onVerify() {
    startTransition(async () => {
      const result = await verifyEmailVerificationCode(code)
      if (result.error) {
        toast.error(result.error)
        return
      }
      try {
        window.sessionStorage.removeItem(AUTO_SENT_STORAGE_KEY)
      } catch {
        // Storage unavailable: nothing was stored.
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
            <div className="relative">
              <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm">+90</span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                maxLength={MAX_PHONE_LENGTH}
                required
                className="ps-11"
              />
            </div>
            <FieldDescription>{t("phoneHint")}</FieldDescription>
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

  if (codeSent) {
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
        <Button type="button" variant="ghost" size="sm" onClick={onSend} disabled={isPending || resendCooldown > 0}>
          {resendCooldown > 0 ? t("resendCtaCooldown", { seconds: resendCooldown }) : t("resendCta")}
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" className="w-full" onClick={onSend} disabled={isPending || autoSendPending}>
      {(isPending || autoSendPending) && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {t("sendCta")}
    </Button>
  )
}
