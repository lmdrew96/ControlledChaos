import type { LocationTag } from "@/types";

interface GeoCoords {
  latitude: number;
  longitude: number;
}

export interface SavedLocation {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  radiusMeters: number | null;
}

export interface LocationMatch {
  name: string;
  locationTag: LocationTag;
  latitude: number;
  longitude: number;
  distanceMeters: number;
}

/**
 * Haversine formula: distance in meters between two lat/lng points.
 */
export function haversineDistance(a: GeoCoords, b: GeoCoords): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Match current coordinates against saved locations.
 * Returns the closest location within its geofence radius, or null.
 */
export function matchLocation(
  current: GeoCoords,
  savedLocations: SavedLocation[]
): LocationMatch | null {
  let closest: LocationMatch | null = null;
  let closestDistance = Infinity;

  for (const loc of savedLocations) {
    if (!loc.latitude || !loc.longitude) continue;

    const lat = parseFloat(loc.latitude);
    const lng = parseFloat(loc.longitude);
    const distance = haversineDistance(current, { latitude: lat, longitude: lng });
    const radius = loc.radiusMeters ?? 200;

    if (distance <= radius && distance < closestDistance) {
      closestDistance = distance;
      closest = {
        name: loc.name,
        locationTag: inferLocationTag(loc.name),
        latitude: lat,
        longitude: lng,
        distanceMeters: Math.round(distance),
      };
    }
  }

  return closest;
}

/**
 * Infer a LocationTag from a location name using keyword matching.
 */
export function inferLocationTag(name: string): LocationTag {
  const lower = name.toLowerCase();
  if (lower.includes("home") || lower.includes("apartment") || lower.includes("dorm"))
    return "home";
  if (
    lower.includes("campus") ||
    lower.includes("university") ||
    lower.includes("library") ||
    lower.includes("class")
  )
    return "campus";
  if (
    lower.includes("work") ||
    lower.includes("office") ||
    lower.includes("eagle") ||
    lower.includes("job")
  )
    return "work";
  return "anywhere";
}
