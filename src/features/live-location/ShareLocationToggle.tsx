"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2, LocateFixed, LocateOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { stopRideLiveLocationSharing, updateRideLiveLocation } from "@/features/live-location/actions"
import { haversineMeters } from "@/utils/geo"
import { logError } from "@/lib/logger"

// Skips sends that are neither meaningfully newer nor meaningfully further
// than the last one actually sent — watchPosition can fire every second or
// two, and every send is a write + a Realtime broadcast to whoever is
// watching, not something worth doing on every GPS tick.
const MIN_INTERVAL_MS = 8_000
const MIN_DISTANCE_M = 15

// Browser-tab-bound: sharing only runs while this page stays open (no
// service-worker/background geolocation) — closing the tab or navigating
// away silently stops updates, same limitation every browser-based (not
// native-app) live-location feature has.
export function ShareLocationToggle({ rideId }: { rideId: string }) {
  const t = useTranslations("LiveLocation")
  const [sharing, setSharing] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const lastSentRef = useRef<{ at: number; lat: number; lng: number } | null>(null)

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  function handlePosition(position: GeolocationPosition) {
    setIsBusy(false)
    setSharing(true)
    const { latitude, longitude } = position.coords
    const last = lastSentRef.current
    const elapsed = last ? Date.now() - last.at : Infinity
    const moved = last ? haversineMeters(last.lat, last.lng, latitude, longitude) : Infinity
    if (elapsed < MIN_INTERVAL_MS && moved < MIN_DISTANCE_M) {
      return
    }
    lastSentRef.current = { at: Date.now(), lat: latitude, lng: longitude }
    updateRideLiveLocation(rideId, latitude, longitude).then((result) => {
      if (result?.error) {
        logError(new Error(result.error), "liveLocation.updateRideLiveLocation")
      }
    })
  }

  function start() {
    if (!("geolocation" in navigator)) {
      toast.error(t("unavailable"))
      return
    }
    setIsBusy(true)
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (error) => {
        setIsBusy(false)
        toast.error(error.code === error.PERMISSION_DENIED ? t("denied") : t("unavailable"))
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 }
    )
  }

  function stop() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setSharing(false)
    lastSentRef.current = null
    stopRideLiveLocationSharing(rideId)
  }

  return (
    <Button type="button" variant={sharing ? "destructive" : "outline"} size="sm" onClick={sharing ? stop : start} disabled={isBusy}>
      {isBusy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : sharing ? (
        <LocateOff className="size-4" aria-hidden="true" />
      ) : (
        <LocateFixed className="size-4" aria-hidden="true" />
      )}
      {sharing ? t("stopSharing") : t("startSharing")}
    </Button>
  )
}
