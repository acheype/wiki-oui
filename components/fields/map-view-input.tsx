"use client";

// map-view widget (ADR 0018): the fixed initial view of the Carte —
// pan/zoom the mini map, its resting view *is* the value ({lat, lng, zoom}).
// Empty means automatic framing on the markers (fit bounds). Loaded
// client-only by the shared field renderer, like GeolocationInput.

import "leaflet/dist/leaflet.css";
import { type RefObject, useEffect, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { OSM_ATTRIBUTION, OSM_TILE_URL } from "./map-pin";

export interface MapViewValue {
  lat: number;
  lng: number;
  zoom: number;
}

// Metropolitan France, same starting view as the geolocation widget.
const DEFAULT_CENTER = { lat: 46.6, lng: 2.4 };
const DEFAULT_ZOOM = 5;

export function MapViewInput({
  value,
  onChange,
}: {
  value: MapViewValue | undefined;
  onChange: (value: MapViewValue | undefined) => void;
}) {
  // Raised while FollowValue resets the view programmatically, so the
  // tracker only records the author's own permissions.
  const programmaticRef = useRef(false);
  return (
    <div className="grid gap-1.5">
      <div className="h-52 overflow-hidden rounded-md border">
        <MapContainer
          center={value ?? DEFAULT_CENTER}
          zoom={value?.zoom ?? DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
          <ViewTracker programmaticRef={programmaticRef} onView={onChange} />
          <FollowValue value={value} programmaticRef={programmaticRef} />
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {value
            ? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)} · zoom ${value.zoom}`
            : "Cadrage automatique sur les fiches"}
        </span>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(undefined)}
          >
            Revenir au cadrage automatique
          </Button>
        )}
      </div>
    </div>
  );
}

// Every user move/zoom lands in the value; the flag filters the programmatic
// reset (a non-animated setView fires moveend synchronously).
function ViewTracker({
  programmaticRef,
  onView,
}: {
  programmaticRef: RefObject<boolean>;
  onView: (value: MapViewValue) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      if (programmaticRef.current) return;
      const center = map.getCenter();
      onView({
        lat: round(center.lat),
        lng: round(center.lng),
        zoom: map.getZoom(),
      });
    },
  });
  return null;
}

/** Clearing the value snaps back to the default view without re-recording it. */
function FollowValue({
  value,
  programmaticRef,
}: {
  value: MapViewValue | undefined;
  programmaticRef: RefObject<boolean>;
}) {
  const map = useMap();
  useEffect(() => {
    if (value) return;
    programmaticRef.current = true;
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
    programmaticRef.current = false;
  }, [map, value, programmaticRef]);
  return null;
}

// Six decimals ≈ 10 cm: enough for a map view, keeps the MDX short.
function round(coordinate: number): number {
  return Math.round(coordinate * 1e6) / 1e6;
}
