"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

interface SavedLocation {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  radiusMeters: number | null;
}

interface LocationMapProps {
  locations: SavedLocation[];
  onSelect: (loc: SavedLocation) => void;
}

/**
 * Interactive Leaflet map rendered only on the client (dynamic import required).
 * Shows a pin + radius circle for every saved location.
 * Clicking a marker fires onSelect so the edit dialog can open.
 */
export function LocationMap({ locations, onSelect }: LocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Leaflet must only run client-side
    import("leaflet").then((L) => {
      // Fix default icon path broken by webpack/Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const validLocs = locations.filter(
        (l) => l.latitude && l.longitude
      );

      // Default center: first pin, or world center
      const defaultCenter: [number, number] =
        validLocs.length > 0
          ? [parseFloat(validLocs[0].latitude!), parseFloat(validLocs[0].longitude!)]
          : [20, 0];

      const map = L.map(containerRef.current!, {
        center: defaultCenter,
        zoom: validLocs.length === 0 ? 2 : 14,
        zoomControl: true,
        attributionControl: true,
      });

      mapRef.current = map;

      // OSM tiles — free, no API key
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        className: "osm-tiles",
      }).addTo(map);

      const bounds: [number, number][] = [];

      validLocs.forEach((loc) => {
        const lat = parseFloat(loc.latitude!);
        const lng = parseFloat(loc.longitude!);
        const radius = loc.radiusMeters ?? 200;

        bounds.push([lat, lng]);

        // Custom DivIcon — clean pin matching the app's design language
        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              display:flex;flex-direction:column;align-items:center;cursor:pointer;
            ">
              <div style="
                background:hsl(var(--primary,221 83% 54%));
                border:2px solid white;
                border-radius:50% 50% 50% 0;
                width:20px;height:20px;
                transform:rotate(-45deg);
                box-shadow:0 2px 6px rgba(0,0,0,0.35);
              "></div>
              <span style="
                margin-top:3px;
                background:white;color:#111;
                font-size:10px;font-weight:600;
                padding:1px 4px;border-radius:3px;
                white-space:nowrap;
                box-shadow:0 1px 3px rgba(0,0,0,0.2);
                max-width:80px;overflow:hidden;text-overflow:ellipsis;
              ">${loc.name}</span>
            </div>
          `,
          iconSize: [20, 36],
          iconAnchor: [10, 20],
          popupAnchor: [0, -22],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(map);
        marker.on("click", () => onSelect(loc));

        // Radius circle
        L.circle([lat, lng], {
          radius,
          color: "hsl(221,83%,54%)",
          fillColor: "hsl(221,83%,54%)",
          fillOpacity: 0.08,
          weight: 1.5,
        }).addTo(map);
      });

      // Fit map to all pins
      if (bounds.length > 0) {
        if (bounds.length === 1) {
          map.setView(bounds[0], 15);
        } else {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Only run once on mount; parent controls re-renders via key prop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="isolate h-64 w-full rounded-lg overflow-hidden border border-border"
      aria-label="Saved locations map"
    />
  );
}
