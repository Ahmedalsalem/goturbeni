"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { parsePhoneNumberFromString } from "libphonenumber-js"

import { createClient } from "@/lib/supabase/server"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { sendVerificationCodeEmail } from "@/lib/email"
import { buildProfileSchema, type ProfileActionState } from "@/features/profile/schemas"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"]
const EMAIL_OTP_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 }
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000

export async function updateProfile(_prevState: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const user = await verifySession()

  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Profile.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Profile.errors" })

  const parsed = buildProfileSchema(tValidation).safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    bio: formData.get("bio"),
    language: formData.get("language"),
    iban: formData.get("iban"),
    ibanHolderName: formData.get("ibanHolderName"),
    carBrand: formData.get("carBrand"),
    carModel: formData.get("carModel"),
  })
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const supabase = await createClient()

  let avatarUrl: string | undefined
  const avatarFile = formData.get("avatar")
  if (avatarFile instanceof File && avatarFile.size > 0) {
    if (avatarFile.size > MAX_AVATAR_BYTES) {
      return { error: tErrors("avatarTooLarge") }
    }
    if (!ALLOWED_AVATAR_TYPES.includes(avatarFile.type)) {
      return { error: tErrors("avatarInvalidType") }
    }

    const extension = avatarFile.type.split("/")[1]
    const path = `${user.id}/avatar.${extension}`
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarFile, {
      upsert: true,
      contentType: avatarFile.type,
    })
    if (uploadError) {
      logError(uploadError, "profile.avatarUpload")
      return { error: tErrors("avatarUploadFailed") }
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path)
    avatarUrl = `${publicUrl}?v=${Date.now()}`
  }

  // Normalize to E.164 before comparing/storing — update_own_profile
  // (0010_phone_verification.sql) resets phone_verified to false whenever
  // the submitted phone differs from what's stored. The form now displays
  // the number without its "+90"/leading-zero prefix (see ProfileForm.tsx),
  // so submitting that raw display value unchanged would always look like a
  // change on the server and silently un-verify the phone.
  const normalizedPhone = parsed.data.phone ? (parsePhoneNumberFromString(parsed.data.phone, "TR")?.number ?? parsed.data.phone) : null

  const { error: updateError } = await supabase.rpc("update_own_profile", {
    p_full_name: parsed.data.fullName,
    p_bio: parsed.data.bio ?? null,
    p_language: parsed.data.language,
    p_avatar_url: avatarUrl ?? null,
    p_phone: normalizedPhone,
    p_iban: parsed.data.iban ?? null,
    p_iban_holder_name: parsed.data.ibanHolderName ?? null,
    p_car_brand: parsed.data.carBrand ?? null,
    p_car_model: parsed.data.carModel ?? null,
  })

  if (updateError) {
    logError(updateError, "profile.updateProfile")
    return { error: tErrors("updateFailed") }
  }

  revalidatePath("/profile")
  return { success: true }
}

// Mandatory account verification via a 6-digit code e-mailed through Resend
// (src/lib/email.ts) — replaces the earlier SMS/OTP approach (Supabase
// Auth's phone_change flow via Twilio). Real SMS delivery has a genuine
// per-message telecom cost with no free tier that lifts a trial account's
// "verified numbers only" restriction; e-mail delivery is already free and
// working. The phone number is still collected and stored (contact/trust
// info) — it just no longer carries the verification burden. The code
// itself lives in profiles_private (email_otp_code/email_otp_expires_at,
// 0035_email_based_verification.sql); verify_email_otp is the only thing
// allowed to flip phone_verified, checked against email_otp_code there.
export async function sendEmailVerificationCode(): Promise<{ error?: string }> {
  const user = await verifySession()
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Profile.phone" })

  if (!(await checkRateLimit(`email-otp:${user.id}`, EMAIL_OTP_RATE_LIMIT.limit, EMAIL_OTP_RATE_LIMIT.windowMs))) {
    return { error: t("tooManyRequests") }
  }

  const code = Math.floor(100_000 + Math.random() * 900_000).toString()
  const supabase = await createClient()
  const { error: updateError } = await supabase
    .from("profiles_private")
    .update({ email_otp_code: code, email_otp_expires_at: new Date(Date.now() + EMAIL_OTP_TTL_MS).toISOString() })
    .eq("id", user.id)
  if (updateError) {
    logError(updateError, "profile.sendEmailVerificationCode.store")
    return { error: t("sendError") }
  }

  const sent = await sendVerificationCodeEmail(user.email!, code, locale)
  if (!sent) {
    return { error: t("sendError") }
  }

  return {}
}

// Legacy-account path on /verify-phone: an account created before gender/phone
// became mandatory (or a fresh signup where the JS-disabled RPC call somehow
// didn't run) is missing one or both. This writes them and immediately kicks
// off the e-mail code send, same as sendEmailVerificationCode — the caller
// (VerifyPhoneClient) moves straight to the code-entry step on success.
export async function completeMandatoryProfileDetails(gender: "female" | "male", phone: string): Promise<{ error?: string }> {
  await verifySession()
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Profile.phone" })

  const parsedPhone = parsePhoneNumberFromString(phone, "TR")
  if (!parsedPhone) {
    return { error: t("sendError") }
  }

  const supabase = await createClient()
  const { error: detailsError } = await supabase.rpc("complete_registration_details", {
    p_gender: gender,
    p_phone: parsedPhone.number,
  })
  if (detailsError) {
    logError(detailsError, "profile.completeMandatoryProfileDetails")
    return { error: t("sendError") }
  }

  return sendEmailVerificationCode()
}

export async function verifyEmailVerificationCode(code: string): Promise<{ error?: string }> {
  await verifySession()
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Profile.phone" })

  const supabase = await createClient()
  const { data: matched, error } = await supabase.rpc("verify_email_otp", { p_code: code })
  if (error) {
    logError(error, "profile.verifyEmailVerificationCode")
    return { error: t("verifyError") }
  }
  if (!matched) {
    return { error: t("verifyError") }
  }

  revalidatePath("/profile")
  return {}
}
