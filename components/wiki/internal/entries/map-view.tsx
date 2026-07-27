"use client";

// Carte (docs/entries-view.md): entries as markers on a Leaflet map —
// curated keyless basemaps, clustering on by default, automatic fit-bounds
// unless a fixed initial view is set, hover tooltip, colored/iconed pins.
// A marker click applies entryDisplay directly: `sidebar` (default — a
// panel beside a still-living map, bottom sheet on mobile) or `map-popup`
// (a Leaflet-anchored mini card whose « Voir la fiche » opens the common
// modal); the tab/popup displays go through the common openEntry.
//
// Markers are managed imperatively (L.marker into a markercluster group):
// react-leaflet has no cluster story on v5, and the imperative layer is
// simpler than bridging one.

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import "leaflet.markercluster";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { entryValue } from "@/lib/entries-view";
import type { ViewEntry } from "@/lib/entries-view";
import { imageUrl } from "@/lib/image-url";
import { SAMPLE_IMAGE } from "@/lib/sample-entries";
import { cn } from "@/lib/utils";
import { defaultEntryDisplay, type ViewContext } from "./types";

/** The curated keyless basemaps (docs/entries-view.md). */
const BASEMAPS: Record<
  string,
  { url: string; attribution: string; maxZoom?: number }
> = {
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "osm-france": {
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> France',
    maxZoom: 20,
  },
  positron: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  "dark-matter": {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  "stadia-smooth": {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "stadia-smooth-dark": {
    url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  "esri-satellite": {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "&copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  },
  opentopo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
};

const DEFAULT_VIEW = { center: [46.6, 2.4] as [number, number], zoom: 5 };

interface Placed {
  entry: ViewEntry;
  point: { lat: number; lng: number };
}

export function MapEntriesView({ context }: { context: ViewContext }) {
  const { entries, data, props } = context;
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const geoField = data.fields.find(
    (field) => field.type === "geolocation"
  )?.name;
  const placed: Placed[] = geoField
    ? entries.flatMap((entry) => {
        const value = entryValue(entry, geoField);
        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          typeof (value as { lat?: unknown }).lat === "number" &&
          typeof (value as { lng?: unknown }).lng === "number"
        ) {
          return [{ entry, point: value as { lat: number; lng: number } }];
        }
        return [];
      })
    : [];

  const display = props.entryDisplay ?? defaultEntryDisplay("map");
  const basemap = BASEMAPS[props.basemap ?? "osm"] ?? BASEMAPS.osm;
  const sidebarOpen = display === "sidebar" && selectedSlug !== null;

  if (!geoField) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        La Carte attend un formulaire doté d&apos;un champ géolocalisation.
      </p>
    );
  }

  return (
    <div
      className="relative flex overflow-hidden rounded-lg border"
      style={{ height: props.height ?? "500px", width: props.width ?? "100%" }}
    >
      <div className="min-w-0 flex-1">
        <MapContainer
          center={
            props.initialArea
              ? [props.initialArea.lat, props.initialArea.lng]
              : DEFAULT_VIEW.center
          }
          zoom={props.initialArea?.zoom ?? DEFAULT_VIEW.zoom}
          scrollWheelZoom={props.wheelZoom === true}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url={basemap.url}
            attribution={basemap.attribution}
            maxZoom={basemap.maxZoom ?? 19}
          />
          <Markers
            placed={placed}
            context={context}
            display={display}
            fitBounds={props.initialArea === undefined}
            onSelect={(slug) => {
              if (display === "sidebar") setSelectedSlug(slug);
              else if (display !== "map-popup") context.openEntry(slug);
            }}
            onOpenModal={(slug) => context.openPopup?.(slug)}
          />
        </MapContainer>
      </div>

      {/* Sidebar: beside the still-living map; bottom sheet on mobile. */}
      {sidebarOpen && selectedSlug && (
        <aside
          className={cn(
            "z-[1000] flex flex-col border-border bg-background",
            "max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[60%] max-md:rounded-t-xl max-md:border-t max-md:shadow-lg",
            "md:w-96 md:border-l"
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <a
              href={`/${selectedSlug}`}
              className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Ouvrir la page de la fiche
              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            </a>
            <button
              type="button"
              aria-label="Fermer le panneau"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setSelectedSlug(null)}
            >
              <X className="size-4" />
            </button>
          </div>
          {context.data.sample ? (
            <p className="p-4 text-sm text-muted-foreground">
              Aperçu indisponible sur une fiche d&apos;exemple.
            </p>
          ) : (
            // A docked panel of fixed height: the frame fills it and scrolls
            // internally, so it wants no auto-height (not a WikiFrame) — only
            // the shared chrome-free route. p-4 matches the sample paragraph
            // above (the route itself renders flush, with no baked-in padding).
            <iframe
              src={`/${encodeURIComponent(selectedSlug)}/iframe`}
              title="Fiche"
              className="min-h-0 w-full flex-1 bg-background p-4"
            />
          )}
        </aside>
      )}
    </div>
  );
}

/** SVG pin colored per entry, with an optional white Iconify glyph. */
function pinIcon(color: string | undefined, icon: string | undefined): L.DivIcon {
  const fill = color ?? "oklch(0.577 0.245 27.325)";
  const glyph = icon
    ? `<img src="/api/icons/${encodeURIComponent(icon)}" width="12" height="12" style="position:absolute;top:5px;left:10px;filter:brightness(0) invert(1)" alt="" />`
    : `<circle cx="12" cy="10" r="3" fill="white"/>`;
  return L.divIcon({
    html: `<div style="position:relative;width:32px;height:32px"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${fill}" stroke="white" stroke-width="1.5"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>${icon ? "" : '<circle cx="12" cy="10" r="3" fill="white"/>'}</svg>${icon ? glyph : ""}</div>`,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -30],
  });
}

// The imperative marker layer: (re)built when the placed entries change,
// clustered unless the author opted out.
function Markers({
  placed,
  context,
  display,
  fitBounds,
  onSelect,
  onOpenModal,
}: {
  placed: Placed[];
  context: ViewContext;
  display: string;
  fitBounds: boolean;
  onSelect: (slug: string) => void;
  onOpenModal: (slug: string) => void;
}) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    const { props } = context;
    const cluster = props.cluster !== false;
    const group: L.LayerGroup =
      cluster && "markerClusterGroup" in L
        ? (L as unknown as { markerClusterGroup: () => L.LayerGroup }).markerClusterGroup()
        : L.layerGroup();

    for (const { entry, point } of placed) {
      const marker = L.marker([point.lat, point.lng], {
        icon: pinIcon(context.colorOf(entry), context.iconOf(entry)),
      });
      const hover = props.hoverField
        ? context.textOf(entry, props.hoverField) || entry.title
        : entry.title;
      if (hover) {
        marker.bindTooltip(hover, { direction: "top", offset: [0, -28] });
      }
      if (display === "map-popup") {
        marker.bindPopup(miniCard(entry, context), {
          minWidth: 200,
          maxWidth: 240,
        });
        marker.on("popupopen", (event) => {
          const button = event.popup
            .getElement()
            ?.querySelector("button[data-slug]");
          button?.addEventListener("click", () => {
            map.closePopup();
            onOpenModal(entry.slug);
          });
        });
      } else {
        marker.on("click", () => onSelect(entry.slug));
      }
      group.addLayer(marker);
    }
    map.addLayer(group);

    // Automatic framing (empty initialArea): once, on the first data.
    if (fitBounds && !fitted.current && placed.length > 0) {
      fitted.current = true;
      map.fitBounds(
        L.latLngBounds(placed.map(({ point }) => [point.lat, point.lng])),
        { padding: [40, 40], maxZoom: 14 }
      );
    }

    return () => {
      map.removeLayer(group);
    };
  }, [map, placed, context, display, fitBounds, onSelect, onOpenModal]);

  return null;
}

// The native map-popup mini card (docs/entries-view.md): visual + title +
// « Voir la fiche » — not configurable.
function miniCard(entry: ViewEntry, context: ViewContext): string {
  // The visual is the form's first image field — the card is not
  // configurable (docs/entries-view.md).
  const imageField = context.data.fields.find(
    (field) => field.type === "image"
  )?.name;
  const value = imageField ? entry.values[imageField] : undefined;
  const image =
    typeof value === "string" && value !== "" && value !== SAMPLE_IMAGE
      ? `<img src="${imageUrl(value, { width: 240 })}" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:6px 6px 0 0" />`
      : "";
  const title = escapeHtml(entry.title);
  const disabled = context.data.sample ? "disabled" : "";
  return `
    <div style="margin:-14px -20px -14px -20px;width:auto">
      ${image}
      <div style="padding:10px 12px">
        <p style="margin:0 0 8px;font-weight:600">${title}</p>
        <button data-slug="${escapeHtml(entry.slug)}" ${disabled}
          style="font:inherit;font-size:12px;padding:4px 10px;border:1px solid #d4d4d8;border-radius:6px;background:white;cursor:pointer">
          Voir la fiche
        </button>
      </div>
    </div>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
}
