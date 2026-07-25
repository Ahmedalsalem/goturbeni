"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { parsePhoneNumberFromString } from "libphonenumber-js"

import { createClient } from "@/lib/supabase/server"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"
import { buildProfileSchema, type ProfileActionState } from "@/features/profile/schemas"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"]

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

  const { error: updateError } = await supabase.rpc("update_own_profile", {
    p_full_name: parsed.data.fullName,
    p_bio: parsed.data.bio ?? null,
    p_language: parsed.data.language,
    p_avatar_url: avatarUrl ?? null,
    p_phone: parsed.data.phone ?? null,
    p_iban: parsed.data.iban ?? null,
    p_iban_holder_name: parsed.data.ibanHolderName ?? null,
  })

  if (updateError) {
    logError(updateError, "profile.updateProfile")
    return { error: tErrors("updateFailed") }
  }

  revalidatePath("/profile")
  return { success: true }
}

// Gerçek SMS/OTP telefon doğrulaması: Supabase Auth'un kendi "phone_change"
// akışını kullanır. Bunun canlıda çalışması için Supabase projesinde bir SMS
// sağlayıcısının (Twilio/MessageBird/Vonage) yapılandırılmış olması gerekir
// (bkz. supabase/config.toml → [auth.sms.twilio]); sağlayıcı bağlı değilken
// Supabase bu çağrıda hata döner, aşağıdaki `sendError` mesajı gösterilir.
// Doğrulama SONUCU (profiles_private.phone_verified) uygulama kodu
// tarafından değil, auth.users.phone_confirmed_at'i dinleyen bir veritabanı
// trigger'ı tarafından yazılır (bkz. supabase/migrations/0010_phone_verification.sql).
export async function sendPhoneVerificationCode(): Promise<{ error?: string; phone?: string }> {
  const user = await verifySession()
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Profile.phone" })

  const supabase = await createClient()
  const { data: privateRow } = await supabase.from("profiles_private").select("phone").eq("id", user.id).single()
  const savedPhone = privateRow?.phone
  if (!savedPhone) {
    return { error: t("noPhoneSaved") }
  }

  const parsed = parsePhoneNumberFromString(savedPhone, "TR")
  if (!parsed) {
    return { error: t("sendError") }
  }

  const { error } = await supabase.auth.updateUser({ phone: parsed.number })
  if (error) {
    logError(error, "profile.sendPhoneVerificationCode")
    return { error: t("sendError") }
  }

  return { phone: parsed.number }
}

// Legacy-account path on /verify-phone: an account created before gender/phone
// became mandatory (or a fresh signup where the JS-disabled RPC call somehow
// didn't run) is missing one or both. This writes them and immediately kicks
// off the phone OTP send, same as sendPhoneVerificationCode — the caller
// (VerifyPhoneClient) moves straight to the code-entry step on success.
export async function completeMandatoryProfileDetails(gender: "female" | "male", phone: string): Promise<{ error?: string; phone?: string }> {
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

  const { error: phoneError } = await supabase.auth.updateUser({ phone: parsedPhone.number })
  if (phoneError) {
    logError(phoneError, "profile.completeMandatoryProfileDetails.sendOtp")
    return { error: t("sendError") }
  }

  return { phone: parsedPhone.number }
}

export async function verifyPhoneVerificationCode(phone: string, code: string): Promise<{ error?: string }> {
  await verifySession()
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Profile.phone" })

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "phone_change" })
  if (error) {
    logError(error, "profile.verifyPhoneVerificationCode")
    return { error: t("verifyError") }
  }

  revalidatePath("/profile")
  return {}
}
