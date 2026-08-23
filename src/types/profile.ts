import type { AppLocale } from "@/i18n/locale-config"

export type ProfileVerificationStatus = "unverified" | "pending" | "verified"
export type ProfileGender = "female" | "male"

// Fixed set of car amenities admins/devs curate (translated in
// messages/*.json under "CarFeatures") — distinct from custom_car_features,
// which is free text the driver types themselves.
export const CAR_FEATURE_KEYS = [
  "ac",
  "bluetooth",
  "usb_charger",
  "large_trunk",
  "leather_seats",
  "sunroof",
  "automatic_transmission",
  "child_seat",
  "navigation",
  "wheelchair_accessible",
] as const
export type CarFeatureKey = (typeof CAR_FEATURE_KEYS)[number]

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
  car_features: CarFeatureKey[]
  custom_car_features: string[]
  bio: string | null
  language: AppLocale
  verification_status: ProfileVerificationStatus
  email_notifications_enabled: boolean
  created_at: string
  updated_at: string
}
