import type { AppLocale } from "@/i18n/locale-config"

export type ProfileVerificationStatus = "unverified" | "pending" | "verified"
export type ProfileGender = "female" | "male"

export interface Profile {
  id: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  phone_verified: boolean
  gender: ProfileGender | null
  iban: string | null
  iban_holder_name: string | null
  car_brand: string | null
  car_model: string | null
  car_plate: string | null
  bio: string | null
  language: AppLocale
  verification_status: ProfileVerificationStatus
  created_at: string
  updated_at: string
}
