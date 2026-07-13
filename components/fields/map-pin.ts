import { divIcon } from "leaflet";

// Shared Leaflet marker + tile config for the geolocation widgets (the
// editable input and the read-only entry map). An inline SVG pin instead of
// Leaflet's default icon: its PNG assets don't survive bundling without loader
// plumbing. Leaflet touches window at import, so importers stay client-only.

export type GeoPoint = { lat: number; lng: number };

export const mapPin = divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="oklch(0.577 0.245 27.325)" stroke="white" stroke-width="1.5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
