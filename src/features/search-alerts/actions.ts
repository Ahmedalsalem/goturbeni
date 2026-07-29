"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { verifySession } from "@/lib/supabase/dal"
import { getUserLocale } from "@/i18n/locale"
import { logError } from "@/lib/logger"

export interface SearchAlertActionState {
  error?: string
  success?: boolean
}

export async function createSearchAlert(departureCity: string, arrivalCity: string): Promise<SearchAlertActionState> {
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "SearchAlerts.errors" })

  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("ride_search_alerts").upsert(
    { user_id: user.id, departure_city: departureCity, arrival_city: arrivalCity },
    { onConflict: "user_id,departure_city,arrival_city" }
  )

  if (error) {
    logError(error, "searchAlerts.createSearchAlert")
    return { error: t("createFailed") }
  }

  revalidatePath("/rides")
  return { success: true }
}

export async function deleteSearchAlert(departureCity: string, arrivalCity: string): Promise<SearchAlertActionState> {
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "SearchAlerts.errors" })

  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from("ride_search_alerts")
    .delete()
    .eq("user_id", user.id)
    .eq("departure_city", departureCity)
    .eq("arrival_city", arrivalCity)

  if (error) {
    logError(error, "searchAlerts.deleteSearchAlert")
    return { error: t("deleteFailed") }
  }

  revalidatePath("/rides")
  return { success: true }
}
