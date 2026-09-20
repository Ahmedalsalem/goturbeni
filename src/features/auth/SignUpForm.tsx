"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, UserPlus } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { signUp } from "@/features/auth/actions"
import { initialAuthActionState, MAX_PHONE_LENGTH } from "@/features/auth/schemas"
import { isValidTrPhoneNumber } from "@/lib/phone-validation"
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton"

const GENDER_OPTIONS = ["female", "male"] as const

// Tek ekranlık uzun form yerine adım adım -- kullanıcı tüm alanları bir
// anda görünce kayıttan vazgeçtiği gözlemlendi (2026-09-20 kullanıcı
// geri bildirimi). Alanlar HER ZAMAN DOM'da kalır (yalnızca CSS ile
// gizlenir), böylece son adımda tek bir native form submit'i tüm
// değerleri (görünmeyen önceki adımlardakiler dahil) FormData'ya taşır
// -- server action (signUp) ve şemadaki (schemas.ts) doğrulama hiç
// değişmedi, sadece istemci tarafı sunum adımlara bölündü.
const STEP_COUNT = 5

export function SignUpForm() {
  const t = useTranslations("Auth.register")
  const tValidation = useTranslations("Auth.validation")
  const tGoogle = useTranslations("Auth.google")
  const [state, formAction, isPending] = useActionState(signUp, initialAuthActionState)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [step, setStep] = useState(0)
  const [stepError, setStepError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  // window.location'dan okunuyor (useSearchParams değil) — bu formu bir
  // Suspense sınırına almaya gerek kalmasın diye; referral kodu yalnızca
  // mount sonrası bir kere okunan, kritik olmayan bir alan.
  const [refCode, setRefCode] = useState<string | null>(null)
  useEffect(() => {
    setRefCode(new URLSearchParams(window.location.search).get("ref"))
  }, [])

  function fieldValue(name: string): string {
    return new FormData(formRef.current ?? undefined).get(name)?.toString().trim() ?? ""
  }

  // Adım geçişinde sadece o adımın alanlarını doğrular -- asıl/otoriter
  // doğrulama submit anında zod şeması üzerinden yine sunucuda çalışır,
  // bu sadece kullanıcıyı erken uyarıp geri dönmesini engelleyen bir
  // ön-kontrol katmanı.
  function validateStep(current: number): string | null {
    if (current === 0) {
      const email = fieldValue("email")
      if (!email) return tValidation("invalidEmail")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return tValidation("invalidEmail")
    }
    if (current === 1) {
      const password = fieldValue("password")
      const confirmPassword = fieldValue("confirmPassword")
      if (password.length < 8) return tValidation("passwordMin")
      if (password !== confirmPassword) return tValidation("passwordsMismatch")
    }
    if (current === 2) {
      if (!fieldValue("fullName")) return tValidation("fullNameRequired")
    }
    if (current === 3) {
      const phone = fieldValue("phone")
      if (!phone) return tValidation("phoneRequired")
      if (!isValidTrPhoneNumber(phone)) return tValidation("phoneInvalid")
    }
    return null
  }

  function goNext() {
    const error = validateStep(step)
    if (error) {
      setStepError(error)
      return
    }
    setStepError(null)
    setStep((current) => Math.min(current + 1, STEP_COUNT - 1))
  }

  function goBack() {
    setStepError(null)
    setStep((current) => Math.max(current - 1, 0))
  }

  return (
    <div className="flex flex-col gap-6">
      {step === 0 && (
        <>
          <GoogleSignInButton />
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <div className="bg-border h-px flex-1" />
            {tGoogle("orDivider")}
            <div className="bg-border h-px flex-1" />
          </div>
        </>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-6">
        {refCode && <input type="hidden" name="ref" value={refCode} />}
        {stepError && (
          <Alert variant="destructive">
            <AlertDescription>{stepError}</AlertDescription>
          </Alert>
        )}
        {state?.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <FieldGroup>
          <div className={step === 0 ? "" : "hidden"}>
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
          </div>

          <div className={step === 1 ? "flex flex-col gap-6" : "hidden"}>
            <Field>
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="pe-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                  className="text-muted-foreground hover:text-foreground absolute end-2.5 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <FieldDescription>{t("passwordHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="confirmPassword">{t("confirmPassword")}</FieldLabel>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="pe-9"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((visible) => !visible)}
                  aria-label={showConfirmPassword ? t("hidePassword") : t("showPassword")}
                  className="text-muted-foreground hover:text-foreground absolute end-2.5 top-1/2 -translate-y-1/2"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </Field>
          </div>

          <div className={step === 2 ? "" : "hidden"}>
            <Field>
              <FieldLabel htmlFor="fullName">{t("fullName")}</FieldLabel>
              <Input id="fullName" name="fullName" type="text" autoComplete="name" required />
            </Field>
          </div>

          <div className={step === 3 ? "" : "hidden"}>
            <Field>
              <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
              <div className="relative">
                <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm">
                  +90
                </span>
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
              <FieldDescription>
                {t.rich("phoneHint", {
                  b: (chunks) => <strong className="text-foreground text-base font-bold">{chunks}</strong>,
                })}
              </FieldDescription>
            </Field>
          </div>

          <div className={step === 4 ? "flex flex-col gap-6" : "hidden"}>
            <Field>
              <FieldLabel htmlFor="dateOfBirth">{t("dateOfBirth")}</FieldLabel>
              <Input id="dateOfBirth" name="dateOfBirth" type="date" required={step === 4} />
              <FieldDescription>{t("dateOfBirthHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="gender">{t("gender")}</FieldLabel>
              <Select name="gender" required={step === 4}>
                <SelectTrigger id="gender" aria-label={t("gender")} className="w-full">
                  <SelectValue placeholder={t("genderPlaceholder")}>
                    {(value: (typeof GENDER_OPTIONS)[number] | null) =>
                      value ? t(`genderOptions.${value}`) : t("genderPlaceholder")
                    }
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

            <Field orientation="horizontal">
              <Checkbox id="termsAccepted" name="termsAccepted" required={step === 4} />
              <FieldLabel htmlFor="termsAccepted" className="font-normal">
                {t("termsPrefix")}{" "}
                <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-2">
                  {t("termsLink")}
                </Link>{" "}
                {t("termsSuffix")}
              </FieldLabel>
            </Field>

            <Field orientation="horizontal">
              <Checkbox id="emailNotificationsOptIn" name="emailNotificationsOptIn" />
              <FieldLabel htmlFor="emailNotificationsOptIn" className="font-normal">
                {t("emailNotificationsOptIn")}
              </FieldLabel>
            </Field>
          </div>
        </FieldGroup>

        <div className="flex gap-3">
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={goBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t("back")}
            </Button>
          )}

          {step < STEP_COUNT - 1 ? (
            <Button type="button" size="lg" className="flex-1" onClick={goNext}>
              {t("next")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" size="lg" className="flex-1" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="size-4" aria-hidden="true" />
              )}
              {t("submit")}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
