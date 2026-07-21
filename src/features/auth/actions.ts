"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { buildAuthSchemas, type AuthActionState } from "@/features/auth/schemas"

async function resolveSiteUrl(): Promise<string> {
  const requestHeaders = await headers()
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http"
  return `${protocol}://${requestHeaders.get("host")}`
}

async function getAuthTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Auth.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Auth.errors" })
  return { schemas: buildAuthSchemas(tValidation), tErrors }
}

export async function signIn(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const { schemas, tErrors } = await getAuthTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }
  const parsed = schemas.signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    return { error: tErrors("invalidCredentials") }
  }
  redirect("/profile")
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const { schemas, tErrors } = await getAuthTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }
  const parsed = schemas.signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const supabase = await createClient()
  const siteUrl = await resolveSiteUrl()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  })
  if (error) {
    return {
      error: error.message === "User already registered" ? tErrors("emailAlreadyRegistered") : tErrors("signupFailed"),
    }
  }
  // If Supabase's "Confirm email" setting is off, signUp already returns an
  // active session (no confirmation email sent) — skip straight to /profile
  // instead of telling the user to check an email that was never sent.
  redirect(data.session ? "/profile" : "/verify-email")
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
