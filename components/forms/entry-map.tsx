"use client";

// Read-only map for an entry's geolocation value on the show page
// (docs/forms.md): a Leaflet map centered on the point with a fixed marker.
// Loaded client-only (Leaflet touches window at import).

import "leaflet/dist/leaflet.css";
import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

const PIN = divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="oklch(0.577 0.245 27.325)" stroke="white" stroke-width="1.5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

export function EntryMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="not-prose h-64 overflow-hidden rounded-md border">
      <MapContainer
        center={{ lat, lng }}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={{ lat, lng }} icon={PIN} />
      </MapContainer>
    </div>
  );
}
