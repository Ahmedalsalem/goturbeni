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
import { PhoneVerification } from "@/features/profile/PhoneVerification"
import {
  initialProfileActionState,
  MAX_BIO_LENGTH,
  MAX_CAR_BRAND_LENGTH,
  MAX_CAR_MODEL_LENGTH,
  MAX_CAR_PLATE_LENGTH,
  MAX_FULL_NAME_LENGTH,
  MAX_IBAN_HOLDER_NAME_LENGTH,
  MAX_IBAN_LENGTH,
  MAX_PHONE_LENGTH,
} from "@/features/profile/schemas"
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locale-config"
import type { Profile } from "@/types/profile"

const LOCALE_LABELS: Record<AppLocale, string> = {
  tr: "Türkçe",
  ar: "العربية",
  en: "English",
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

        {profile.gender && (
          // Read-only by design: gender feeds the "Kadın Şoför" search filter
          // and other trust-related features, so it's fixed at signup and
          // can't be changed here.
          <Field>
            <FieldLabel htmlFor="gender">{t("gender")}</FieldLabel>
            <Input id="gender" value={t(`genderOptions.${profile.gender}`)} disabled readOnly />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="phone">{t("phone")}</FieldLabel>
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm">+90</span>
            <Input
              id="phone"
              name="phone"
              type="tel"
              // Stored value is full E.164 (e.g. "+905551234567") — strip the
              // "+90" since it's now shown as a fixed prefix next to the field.
              defaultValue={initialProfile.phone?.replace(/^\+90/, "") ?? ""}
              maxLength={MAX_PHONE_LENGTH}
              className="ps-11"
            />
          </div>
          <FieldDescription>{t("phoneHint")}</FieldDescription>
          <PhoneVerification phone={profile.phone} verified={profile.phone_verified} />
        </Field>

        <Field>
          <FieldLabel htmlFor="iban">{t("iban")}</FieldLabel>
          <Input id="iban" name="iban" defaultValue={initialProfile.iban ?? ""} maxLength={MAX_IBAN_LENGTH} placeholder="TR.." />
          <FieldDescription>{t("ibanHint")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="ibanHolderName">{t("ibanHolderName")}</FieldLabel>
          <Input
            id="ibanHolderName"
            name="ibanHolderName"
            defaultValue={initialProfile.iban_holder_name ?? ""}
            maxLength={MAX_IBAN_HOLDER_NAME_LENGTH}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="carBrand">{t("carBrand")}</FieldLabel>
            <Input id="carBrand" name="carBrand" defaultValue={initialProfile.car_brand ?? ""} maxLength={MAX_CAR_BRAND_LENGTH} />
          </Field>

          <Field>
            <FieldLabel htmlFor="carModel">{t("carModel")}</FieldLabel>
            <Input id="carModel" name="carModel" defaultValue={initialProfile.car_model ?? ""} maxLength={MAX_CAR_MODEL_LENGTH} />
          </Field>

          <Field>
            <FieldLabel htmlFor="carPlate">{t("carPlate")}</FieldLabel>
            <Input
              id="carPlate"
              name="carPlate"
              defaultValue={initialProfile.car_plate ?? ""}
              maxLength={MAX_CAR_PLATE_LENGTH}
              className="uppercase"
            />
          </Field>
        </div>
        <FieldDescription>{t("carHint")}</FieldDescription>

        <Field>
          <FieldLabel htmlFor="bio">{t("bio")}</FieldLabel>
          <Textarea id="bio" name="bio" defaultValue={initialProfile.bio ?? ""} maxLength={MAX_BIO_LENGTH} rows={4} />
          <FieldDescription>{t("bioHint")}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="language">{t("language")}</FieldLabel>
          <Select name="language" defaultValue={initialProfile.language} items={LOCALE_LABELS}>
            <SelectTrigger id="language" aria-label={t("language")} className="w-full">
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
