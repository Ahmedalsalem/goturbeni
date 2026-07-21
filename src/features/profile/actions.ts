"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
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
      return { error: tErrors("avatarUploadFailed") }
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path)
    avatarUrl = `${publicUrl}?v=${Date.now()}`
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      bio: parsed.data.bio ?? null,
      language: parsed.data.language,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", user.id)

  if (updateError) {
    return { error: tErrors("updateFailed") }
  }

  revalidatePath("/profile")
  return { success: true }
}
