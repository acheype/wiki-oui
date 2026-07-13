"use client";

// Geolocation widget (docs/forms.md): a Leaflet map (OSM tiles) with an
// adjustable marker, Nominatim geocoding from the form's designated address
// fields, and optional browser geolocation. Stores {lat, lng}.

import "leaflet/dist/leaflet.css";
import { divIcon } from "leaflet";
import { LocateFixed, MapPinned } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Leaflet touches window at import time: this whole module is loaded
// client-only (dynamic ssr:false) by the shared field renderer.

export type GeoPoint = { lat: number; lng: number };

/** Which sibling fields hold the address, as designated by the form admin. */
export interface AddressBindings {
  streetField?: string;
  street1Field?: string;
  street2Field?: string;
  postalCodeField?: string;
  townField?: string;
  countyField?: string;
  stateField?: string;
}

// Metropolitan France, the wiki's likely audience — just a starting view.
const DEFAULT_CENTER: GeoPoint = { lat: 46.6, lng: 2.4 };
const DEFAULT_ZOOM = 5;
const POINT_ZOOM = 15;

// An inline SVG pin instead of Leaflet's default icon: its PNG assets don't
// survive bundling without loader plumbing.
const PIN = divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="oklch(0.577 0.245 27.325)" stroke="white" stroke-width="1.5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

export function GeolocationInput({
  value,
  bindings,
  geolocateButton,
  entryValues,
  onChange,
}: {
  value: GeoPoint | undefined;
  bindings: AddressBindings;
  geolocateButton?: boolean;
  /** Live sibling values, for geocoding the designated address fields. */
  entryValues?: Record<string, unknown>;
  onChange: (value: GeoPoint | undefined) => void;
}) {
  const [busy, setBusy] = useState(false);

  const addressQuery = useMemo(() => {
    const names = [
      bindings.streetField,
      bindings.street1Field,
      bindings.street2Field,
      bindings.postalCodeField,
      bindings.townField,
      bindings.countyField,
      bindings.stateField,
    ];
    return names
      .flatMap((name) => {
        const part = name ? entryValues?.[name] : undefined;
        return typeof part === "string" && part.trim() !== "" ? [part.trim()] : [];
      })
      .join(", ");
  }, [bindings, entryValues]);

  async function geocodeAddress() {
    setBusy(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressQuery)}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      const results = (await response.json()) as { lat: string; lon: string }[];
      if (results.length === 0) {
        toast.error("Adresse introuvable.");
        return;
      }
      onChange({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
    } catch {
      toast.error("Le géocodage a échoué.");
    } finally {
      setBusy(false);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur ce navigateur.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setBusy(false);
      },
      () => {
        toast.error("Position introuvable.");
        setBusy(false);
      }
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {addressQuery !== "" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={geocodeAddress}
          >
            <MapPinned />
            Géolocaliser l&apos;adresse
          </Button>
        )}
        {geolocateButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={locateMe}
          >
            <LocateFixed />
            Depuis ma position
          </Button>
        )}
        {value && (
          <span className="text-xs text-muted-foreground">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
        )}
      </div>
      <div className="h-64 overflow-hidden rounded-md border">
        <MapContainer
          center={value ?? DEFAULT_CENTER}
          zoom={value ? POINT_ZOOM : DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <Recenter point={value} />
          <ClickCatcher onPick={(point) => onChange(point)} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {value && (
            <Marker
              position={value}
              icon={PIN}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const position = event.target.getLatLng();
                  onChange({ lat: position.lat, lng: position.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}

// useMapEvents must run inside MapContainer.
function ClickCatcher({ onPick }: { onPick: (point: GeoPoint) => void }) {
  useMapEvents({
    click: (event) => onPick({ lat: event.latlng.lat, lng: event.latlng.lng }),
  });
  return null;
}

// Leaflet's center prop is initial-only: follow programmatic moves
// (geocoding, browser position) by flying to the new point, never below a
// readable zoom. A drag lands on the map's own position — visually a no-op.
function Recenter({ point }: { point: GeoPoint | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo(point, Math.max(map.getZoom(), 13));
  }, [map, point]);
  return null;
}
