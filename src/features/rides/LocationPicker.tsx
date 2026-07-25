"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useLocale, useTranslations } from "next-intl"
import { Loader2, LocateFixed, Map as MapIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { FieldDescription } from "@/components/ui/field"
import { logError } from "@/lib/logger"
import { reverseGeocode } from "@/features/rides/reverse-geocode"
import { matchTurkishLocation } from "@/utils/match-turkish-location"
import type { TurkishProvince } from "@/utils/turkish-provinces"

// Leaflet touches `window`/`document` at import time, so the map must never
// be part of the server-rendered bundle.
const LocationPickerMap = dynamic(() => import("@/features/rides/LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-muted" />,
})

// Turkey's rough geographic center — the map's default view before a
// position (from geolocation or a manual drag) is available.
const TURKEY_CENTER: [number, number] = [39, 35]

export function LocationPicker({
  onLocationResolved,
}: {
  onLocationResolved: (province: TurkishProvince, district: string | null) => void
}) {
  const t = useTranslations("Rides.form")
  const locale = useLocale()
  const [isMapOpen, setIsMapOpen] = useState(false)
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [status, setStatus] = useState<"idle" | "locating" | "resolving">("idle")

  async function resolveAndApply(lat: number, lon: number) {
    try {
      const address = await reverseGeocode(lat, lon, locale)
      const matched = matchTurkishLocation(address)
      if (!matched) {
        toast.error(t("locationNoMatch"))
        return
      }
      onLocationResolved(matched.province, matched.district)
    } catch (error) {
      logError(error, "rides.reverseGeocode")
      toast.error(t("locationUnavailable"))
    }
  }

  function onUseMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error(t("locationUnavailable"))
      return
    }
    setStatus("locating")
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const next: [number, number] = [result.coords.latitude, result.coords.longitude]
        setPosition(next)
        setStatus("resolving")
        void resolveAndApply(next[0], next[1]).finally(() => setStatus("idle"))
      },
      (error) => {
        setStatus("idle")
        toast.error(error.code === error.PERMISSION_DENIED ? t("locationDenied") : t("locationUnavailable"))
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function onPositionChange(lat: number, lng: number) {
    setPosition([lat, lng])
    setStatus("resolving")
    void resolveAndApply(lat, lng).finally(() => setStatus("idle"))
  }

  const isBusy = status !== "idle"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onUseMyLocation} disabled={isBusy}>
          {status === "locating" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <LocateFixed className="size-4" aria-hidden="true" />
          )}
          {t("useMyLocation")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setIsMapOpen((open) => !open)} disabled={isBusy}>
          <MapIcon className="size-4" aria-hidden="true" />
          {isMapOpen ? t("hideMap") : t("showMap")}
        </Button>
        {isBusy && <span className="text-sm text-muted-foreground">{t("detectingLocation")}</span>}
      </div>

      {isMapOpen && (
        <div className="flex flex-col gap-1.5">
          <LocationPickerMap position={position ?? TURKEY_CENTER} onPositionChange={onPositionChange} />
          <FieldDescription>{t("mapInstructions")}</FieldDescription>
        </div>
      )}
    </div>
  )
}
