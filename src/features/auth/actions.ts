"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { parsePhoneNumberFromString } from "libphonenumber-js"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { getCurrentUser } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"
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
  if (!(await checkRateLimit(`signin:${ip}`, LOGIN_RATE_LIMIT.limit, LOGIN_RATE_LIMIT.windowMs))) {
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
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    logError(error, "auth.signIn")
    return { error: tErrors("invalidCredentials") }
  }

  // Mandatory one-time phone verification gate: an account that never
  // completed it (or predates this requirement) is sent to /verify-phone
  // instead of straight into the app. Once verified, this check is never
  // shown again — no repeated OTP on subsequent logins.
  const { data: privateRow } = await supabase
    .from("profiles_private")
    .select("phone_verified")
    .eq("id", data.user.id)
    .maybeSingle()
  if (!privateRow?.phone_verified) {
    redirect("/verify-phone")
  }

  // Straight to ride search after login — that's the action most users came
  // back to do, not their own profile.
  redirect("/rides")
}

export async function signUp(_prevState: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const { schemas, tErrors } = await getAuthTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }
  const ip = await getClientIp()
  if (!(await checkRateLimit(`signup:${ip}`, SIGNUP_RATE_LIMIT.limit, SIGNUP_RATE_LIMIT.windowMs))) {
    return { error: tErrors("tooManyRequests") }
  }
  const parsed = schemas.signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    gender: formData.get("gender"),
    phone: formData.get("phone"),
  })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  // The zod refine already validated this via isValidTrPhoneNumber, which
  // uses the same "TR"-default parser — this can't actually fail, but keeps
  // parsedPhone.number (E.164) available without re-deriving the check.
  const parsedPhone = parsePhoneNumberFromString(parsed.data.phone, "TR")
  if (!parsedPhone) {
    return { error: tErrors("invalidForm") }
  }

  const supabase = await createClient()
  const siteUrl = await resolveSiteUrl()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  })
  if (error) {
    logError(error, "auth.signUp")
    return {
      error: error.message === "User already registered" ? tErrors("emailAlreadyRegistered") : tErrors("signupFailed"),
    }
  }

  // If Supabase's "Confirm email" setting is off, signUp already returns an
  // active session (no confirmation email sent) — in that case the mandatory
  // phone OTP step can start immediately. Otherwise (email confirmation
  // required) there's no session yet to attach the phone/gender to; fall
  // back to the pre-existing /verify-email flow, unchanged.
  if (!data.session) {
    redirect("/verify-email")
  }

  const { error: detailsError } = await supabase.rpc("complete_registration_details", {
    p_gender: parsed.data.gender,
    p_phone: parsedPhone.number,
  })
  if (detailsError) {
    logError(detailsError, "auth.signUp.completeRegistrationDetails")
    return { error: tErrors("signupFailed") }
  }

  // Kicks off the actual SMS OTP send via Supabase Auth's phone_change flow
  // (same mechanism as features/profile/actions.ts's sendPhoneVerificationCode).
  // Requires a real SMS provider configured in the Supabase project — not
  // yet set up here, so this call succeeds but no SMS is actually delivered
  // until one is configured (see README → known limitations).
  const { error: phoneError } = await supabase.auth.updateUser({ phone: parsedPhone.number })
  if (phoneError) {
    logError(phoneError, "auth.signUp.sendPhoneOtp")
  }

  redirect("/verify-phone")
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
  if (!(await checkRateLimit(`reset:${ip}`, PASSWORD_RESET_RATE_LIMIT.limit, PASSWORD_RESET_RATE_LIMIT.windowMs))) {
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
    logError(error, "auth.updatePassword")
    return { error: tErrors("resetFailed") }
  }
  redirect("/profile")
}
