"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import { firstIssueMessage } from "@/lib/zod-error"
import { getUserLocale } from "@/i18n/locale"
import { verifySession } from "@/lib/supabase/dal"
import { buildRideSchema, type RideActionState, type RideFormValues } from "@/features/rides/schemas"

async function getRideTranslators() {
  const locale = await getUserLocale()
  const tValidation = await getTranslations({ locale, namespace: "Rides.validation" })
  const tErrors = await getTranslations({ locale, namespace: "Rides.errors" })
  return { schema: buildRideSchema(tValidation), tErrors }
}

// Shared insert/update payload shape for createRide/updateRide. available_seats
// mirrors seat_count on both create and edit — there's no partial-booking
// mechanism yet (see README "Faz 2 Notları"), so the two always stay in sync.
function buildRideRow(parsed: RideFormValues) {
  return {
    departure_city: parsed.departureCity,
    arrival_city: parsed.arrivalCity,
    departure_time: new Date(`${parsed.departureDate}T${parsed.departureTime}`).toISOString(),
    seat_count: parsed.seatCount,
    available_seats: parsed.seatCount,
    cost_share: parsed.costShare,
    description: parsed.description ?? null,
  }
}

export async function createRide(values: RideFormValues): Promise<RideActionState> {
  const { schema, tErrors } = await getRideTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  const supabase = await createClient()

  const { error } = await supabase.from("rides").insert({
    driver_id: user.id,
    ...buildRideRow(parsed.data),
  })

  if (error) {
    return { error: tErrors("createFailed") }
  }

  redirect("/rides/mine")
}

export async function updateRide(rideId: string, values: RideFormValues): Promise<RideActionState> {
  const { schema, tErrors } = await getRideTranslators()
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return { error: firstIssueMessage(parsed.error, tErrors("invalidForm")) }
  }

  const user = await verifySession()
  const supabase = await createClient()

  const { error } = await supabase
    .from("rides")
    .update(buildRideRow(parsed.data))
    .eq("id", rideId)
    .eq("driver_id", user.id)
    .eq("status", "active")

  if (error) {
    return { error: tErrors("updateFailed") }
  }

  redirect("/rides/mine")
}

export async function cancelRide(rideId: string): Promise<RideActionState> {
  const locale = await getUserLocale()
  const tErrors = await getTranslations({ locale, namespace: "Rides.errors" })
  if (!isSupabaseConfigured()) {
    return { error: tErrors("notConfigured") }
  }

  const user = await verifySession()
  const supabase = await createClient()

  const { error } = await supabase
    .from("rides")
    .update({ status: "cancelled" })
    .eq("id", rideId)
    .eq("driver_id", user.id)

  if (error) {
    return { error: tErrors("cancelFailed") }
  }

  revalidatePath("/rides/mine")
  return { success: true }
}
