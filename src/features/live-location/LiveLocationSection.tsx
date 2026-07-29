"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"
import { LiveLocationMap } from "@/features/live-location/LiveLocationMap"
import type { RideLiveLocation } from "@/features/live-location/queries"

// Geolocation prompt + Leaflet/Realtime only load once the passenger actually
// asks to see the map — not on every /bookings page load.
export function LiveLocationSection({ rideId, initialLocation }: { rideId: string; initialLocation: RideLiveLocation | null }) {
  const t = useTranslations("LiveLocation")
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MapPin className="size-4" aria-hidden="true" /> {t("viewLiveLocation")}
      </Button>
    )
  }

  return <LiveLocationMap rideId={rideId} initialLocation={initialLocation} />
}
