"use client"

import { useActionState, useState } from "react"
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signUp } from "@/features/auth/actions"
import { initialAuthActionState } from "@/features/auth/schemas"

export function SignUpForm() {
  const t = useTranslations("Auth.register")
  const [state, formAction, isPending] = useActionState(signUp, initialAuthActionState)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

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
              {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
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
              {showConfirmPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            </button>
          </div>
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="size-4" aria-hidden="true" />
        )}
        {t("submit")}
      </Button>
    </form>
  )
}
