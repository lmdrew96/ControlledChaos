"use client";

import { useState, useEffect, useRef } from "react";

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

/** Debounced address search via Nominatim (OpenStreetMap). Free, no API key. */
export function useAddressSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({
          q: query,
          format: "json",
          limit: "5",
          addressdetails: "0",
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { "User-Agent": "ControlledChaos/1.0" } }
        );
        if (res.ok) {
          setResults(await res.json());
        }
      } catch {
        // Silently fail — user can retry or use GPS
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  return { query, setQuery, results, setResults, isSearching };
}
