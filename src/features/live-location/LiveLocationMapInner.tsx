"use client"

import { useEffect } from "react"
import L from "leaflet"
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet"

import "leaflet/dist/leaflet.css"

// Same CDN-hosted marker image workaround as LocationPickerMap.tsx (Leaflet's
// default marker paths don't resolve under Next.js's bundler).
const driverIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

// A small colored dot (rather than a second pin) so "you" is visually
// distinct from the driver's marker at a glance.
const passengerIcon = L.divIcon({
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></div>',
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = points.map((p) => p.join(",")).join("|")
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 14)
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

export default function LiveLocationMapInner({
  driverPosition,
  passengerPosition,
}: {
  driverPosition: [number, number]
  passengerPosition: [number, number] | null
}) {
  const points: [number, number][] = passengerPosition ? [driverPosition, passengerPosition] : [driverPosition]

  return (
    <MapContainer center={driverPosition} zoom={13} scrollWheelZoom={false} className="h-64 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={driverPosition} icon={driverIcon} />
      {passengerPosition && <Marker position={passengerPosition} icon={passengerIcon} />}
      <FitBounds points={points} />
    </MapContainer>
  )
}
