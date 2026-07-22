"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { getCurrentUser } from "@/lib/supabase/dal"
import { buildAuthSchemas, type AuthActionState } from "@/features/auth/schemas"

const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }
const SIGNUP_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 }
const PASSWORD_RESET_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 }

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
  const ip = await getClientIp()
  if (!checkRateLimit(`signin:${ip}`, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowMs)) {
    return { error: tErrors("tooManyRequests") }
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
  const ip = await getClientIp()
  if (!checkRateLimit(`signup:${ip}`, SIGNUP_RATE_LIMIT.limit, SIGNUP_RATE_LIMIT.windowMs)) {
    return { error: tErrors("tooManyRequests") }
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

export async function requestPasswordReset(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const { schemas, tErrors } = await getAuthTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }
  const ip = await getClientIp()
  if (!checkRateLimit(`reset:${ip}`, PASSWORD_RESET_RATE_LIMIT.limit, PASSWORD_RESET_RATE_LIMIT.windowMs)) {
    return { error: tErrors("tooManyRequests") }
  }
  const parsed = schemas.forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const supabase = await createClient()
  const siteUrl = await resolveSiteUrl()
  // Supabase returns success here even for unregistered emails — don't
  // branch on `error` beyond that, or this endpoint becomes an email
  // enumeration oracle. The UI always shows the same "check your inbox"
  // message regardless of whether the account exists.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  })
  return { success: true }
}

export async function updatePassword(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const { schemas, tErrors } = await getAuthTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }
  const parsed = schemas.resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  // updateUser requires the temporary session established by exchanging the
  // recovery link's code in /auth/callback — not a normal signed-in session.
  const user = await getCurrentUser()
  if (!user) {
    return { error: tErrors("sessionExpired") }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { error: tErrors("resetFailed") }
  }
  redirect("/profile")
}
