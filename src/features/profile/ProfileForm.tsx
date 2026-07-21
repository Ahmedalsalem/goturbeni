"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Loader2, Save, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateProfile } from "@/features/profile/actions"
import {
  initialProfileActionState,
  MAX_BIO_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MAX_PHONE_LENGTH,
} from "@/features/profile/schemas"
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locale-config"
import type { Profile } from "@/types/profile"

const LOCALE_LABELS: Record<AppLocale, string> = {
  tr: "Türkçe",
  ar: "العربية",
}

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const t = useTranslations("Profile.form")
  const [state, formAction, isPending] = useActionState(updateProfile, initialProfileActionState)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Snapshot the profile once at mount for the uncontrolled fields'
  // defaultValue. After a successful save, revalidatePath("/profile") sends
  // this same mounted instance a fresh `profile` prop — if defaultValue were
  // derived from that live prop, Base UI's Field warns about an uncontrolled
  // control's default value changing post-init. Sourcing defaultValue from a
  // stable ref avoids that without giving up the success toast (which relies
  // on this instance staying mounted so its useActionState/useEffect survive).
  const initialProfile = useRef(profile).current

  useEffect(() => {
    if (state.success) {
      toast.success(t("saved"))
    }
  }, [state.success, t])

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
  }

  const initials = (profile.full_name ?? email).slice(0, 2).toUpperCase()

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarImage src={avatarPreview ?? undefined} alt={profile.full_name ?? email} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            name="avatar"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onAvatarChange}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload /> {t("changeAvatar")}
          </Button>
        </div>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fullName">{t("fullName")}</FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={initialProfile.full_name ?? ""}
            maxLength={MAX_FULL_NAME_LENGTH}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" value={email} disabled readOnly />
        </Field>

        <Field>
          <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initialProfile.phone ?? ""}
            maxLength={MAX_PHONE_LENGTH}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="bio">{t("bio")}</FieldLabel>
          <Textarea id="bio" name="bio" defaultValue={initialProfile.bio ?? ""} maxLength={MAX_BIO_LENGTH} rows={4} />
          <FieldDescription>{t("bioHint")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="language">{t("language")}</FieldLabel>
          <Select name="language" defaultValue={initialProfile.language} items={LOCALE_LABELS}>
            <SelectTrigger id="language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LOCALES.map((value) => (
                <SelectItem key={value} value={value}>
                  {LOCALE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        {t("save")}
      </Button>
    </form>
  )
}
