import type { AppLocale } from "@/i18n/locale-config"

export type ProfileVerificationStatus = "unverified" | "pending" | "verified"

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  phone_verified: boolean
  bio: string | null
  language: AppLocale
  verification_status: ProfileVerificationStatus
  created_at: string
  updated_at: string
}
