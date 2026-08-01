"use client"

import { useEffect } from "react"
import L from "leaflet"
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet"

import "leaflet/dist/leaflet.css"

// Leaflet's default marker image paths assume a plain static-asset server,
// which breaks under Next.js's bundler (the images never resolve). Pointing
// at the CDN build matching the installed leaflet version sidesteps that —
// this module is only ever loaded client-side (see the dynamic(..., { ssr:
// false }) import in LocationPicker.tsx), so touching `L` at module scope
// here is safe.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(position, map.getZoom())
    // Only re-run when the position itself changes, not on every zoom/pan —
    // otherwise panning the map would keep snapping back to `position`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1]])
  return null
}

// Dragging a small marker pin is fiddly on a touchscreen (the finger covers
// the target, drag gestures fight the map's own pan gesture). Tapping
// anywhere on the map to place the point there is the mobile-friendly
// equivalent, so the marker is fixed and this listens for map clicks/taps
// instead of making the marker itself draggable.
function ClickToPlace({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (event) => onPositionChange(event.latlng.lat, event.latlng.lng),
  })
  return null
}

export default function LocationPickerMap({
  position,
  onPositionChange,
}: {
  position: [number, number]
  onPositionChange: (lat: number, lng: number) => void
}) {
  return (
    <MapContainer center={position} zoom={11} scrollWheelZoom className="h-56 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={position} icon={markerIcon} />
      <ClickToPlace onPositionChange={onPositionChange} />
      <Recenter position={position} />
    </MapContainer>
  )
}
