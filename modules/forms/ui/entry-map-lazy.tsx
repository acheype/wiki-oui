"use client";

import dynamic from "next/dynamic";

// Client boundary for the read-only entry map: Leaflet touches window at
// import time, and `ssr: false` is only honoured inside a client module —
// a server component importing entry-map directly crashes the SSR pass
// ("window is not defined") as soon as an entry carries a geolocation.
export const EntryMap = dynamic(
  () => import("./entry-map").then((mod) => mod.EntryMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-md border bg-muted/40" />
    ),
  }
);
