"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Mail } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { requestPasswordReset } from "@/features/auth/actions"
import { initialAuthActionState } from "@/features/auth/schemas"

export function ForgotPasswordForm() {
  const t = useTranslations("Auth.forgotPassword")
  const [state, formAction, isPending] = useActionState(requestPasswordReset, initialAuthActionState)

  if (state?.success) {
    return (
      <Alert>
        <AlertTitle>{t("successTitle")}</AlertTitle>
        <AlertDescription>{t("successDescription")}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
        {t("submit")}
      </Button>

      <Link
        href="/login"
        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t("backToLogin")}
      </Link>
    </form>
  )
}
