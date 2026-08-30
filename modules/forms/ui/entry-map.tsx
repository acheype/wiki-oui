"use client";

// Read-only map for an entry's geolocation value on the show page
// (docs/forms.md): a Leaflet map centered on the point with a fixed marker.
// Loaded client-only (Leaflet touches window at import).

import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import {
  OSM_ATTRIBUTION,
  OSM_TILE_URL,
  mapPin,
} from "@/components/fields/map-pin";

export function EntryMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="not-prose h-64 overflow-hidden rounded-md border">
      <MapContainer
        center={{ lat, lng }}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        <Marker position={{ lat, lng }} icon={mapPin} />
      </MapContainer>
    </div>
  );
}
