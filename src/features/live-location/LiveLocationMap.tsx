"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useFormatter, useTranslations } from "next-intl"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { haversineMeters } from "@/utils/geo"
import type { RideLiveLocation } from "@/features/live-location/queries"

const LiveLocationMapInner = dynamic(() => import("@/features/live-location/LiveLocationMapInner"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />,
})

// Only re-renders the trend arrow on a real change in direction — a couple of
// meters of GPS jitter shouldn't flip "approaching" on and off every tick.
const TREND_THRESHOLD_M = 10

type Trend = "approaching" | "moving-away" | null

export function LiveLocationMap({ rideId, initialLocation }: { rideId: string; initialLocation: RideLiveLocation | null }) {
  const t = useTranslations("LiveLocation")
  const format = useFormatter()
  const [location, setLocation] = useState(initialLocation)
  const [passengerPosition, setPassengerPosition] = useState<[number, number] | null>(null)
  const previousDistanceRef = useRef<number | null>(null)
  const [trend, setTrend] = useState<Trend>(null)

  useEffect(() => {
    if (!("geolocation" in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (position) => setPassengerPosition([position.coords.latitude, position.coords.longitude]),
      () => {
        // Silent — the map/distance just won't show a "you" marker or a
        // distance figure if the passenger declines the permission prompt.
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    )
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`ride-live-location:${rideId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ride_live_locations", filter: `ride_id=eq.${rideId}` },
        (payload) => setLocation(rowToLocation(payload.new))
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ride_live_locations", filter: `ride_id=eq.${rideId}` },
        (payload) => setLocation(rowToLocation(payload.new))
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [rideId])

  useEffect(() => {
    if (!location?.isActive || !passengerPosition) return
    const distance = haversineMeters(location.lat, location.lng, passengerPosition[0], passengerPosition[1])
    const previous = previousDistanceRef.current
    if (previous !== null) {
      const delta = distance - previous
      if (delta < -TREND_THRESHOLD_M) setTrend("approaching")
      else if (delta > TREND_THRESHOLD_M) setTrend("moving-away")
    }
    previousDistanceRef.current = distance
  }, [location, passengerPosition])

  if (!location?.isActive) {
    return (
      <p className="text-muted-foreground text-sm">
        {location ? t("stoppedSharing", { time: format.relativeTime(new Date(location.updatedAt)) }) : t("notSharing")}
      </p>
    )
  }

  const distanceMeters = passengerPosition
    ? haversineMeters(location.lat, location.lng, passengerPosition[0], passengerPosition[1])
    : null

  return (
    <div className="flex flex-col gap-2">
      <LiveLocationMapInner driverPosition={[location.lat, location.lng]} passengerPosition={passengerPosition} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{t("lastUpdated", { time: format.relativeTime(new Date(location.updatedAt)) })}</span>
        {distanceMeters !== null && (
          <span className="flex items-center gap-1 font-medium">
            {trend === "approaching" && <ArrowDownRight className="text-primary size-4" aria-hidden="true" />}
            {trend === "moving-away" && <ArrowUpRight className="text-muted-foreground size-4" aria-hidden="true" />}
            {distanceMeters < 1000 ? t("distanceMeters", { meters: Math.round(distanceMeters) }) : t("distanceKm", { km: (distanceMeters / 1000).toFixed(1) })}
            {trend === "approaching" && <span className="text-primary"> · {t("approaching")}</span>}
          </span>
        )}
      </div>
    </div>
  )
}

function rowToLocation(row: unknown): RideLiveLocation {
  const r = row as { lat: number; lng: number; is_active: boolean; updated_at: string }
  return { lat: r.lat, lng: r.lng, isActive: r.is_active, updatedAt: r.updated_at }
}
