"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MapPin,
  Plus,
  Trash2,
  Loader2,
  Navigation,
  Pencil,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";

interface SavedLocation {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  radiusMeters: number | null;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

/** Debounced address search via Nominatim (OpenStreetMap). Free, no API key. */
function useAddressSearch() {
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

export function SavedLocations() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("200");
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Address search
  const search = useAddressSearch();

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/locations");
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  function resetForm() {
    setName("");
    setLatitude("");
    setLongitude("");
    setRadiusMeters("200");
    setEditingId(null);
    search.setQuery("");
    search.setResults([]);
  }

  function openAdd() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(loc: SavedLocation) {
    setName(loc.name);
    setLatitude(loc.latitude ?? "");
    setLongitude(loc.longitude ?? "");
    setRadiusMeters(String(loc.radiusMeters ?? 200));
    setEditingId(loc.id);
    search.setQuery("");
    search.setResults([]);
    setDialogOpen(true);
  }

  function selectSearchResult(result: NominatimResult) {
    setLatitude(parseFloat(result.lat).toFixed(6));
    setLongitude(parseFloat(result.lon).toFixed(6));
    // Auto-fill name if empty
    if (!name.trim()) {
      // Use the first meaningful part of the display name
      const parts = result.display_name.split(",");
      setName(parts[0].trim());
    }
    search.setQuery(result.display_name);
    search.setResults([]);
    toast.success("Address selected!");
  }

  function detectCurrentPosition() {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }

    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setIsDetecting(false);
        toast.success("Location detected!");
      },
      (err) => {
        setIsDetecting(false);
        toast.error(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!latitude || !longitude) {
      toast.error("Search for an address or use your current position");
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        name: name.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radiusMeters: parseInt(radiusMeters) || 200,
      };

      const url = editingId
        ? `/api/locations/${editingId}`
        : "/api/locations";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      toast.success(editingId ? "Location updated!" : "Location added!");
      setDialogOpen(false);
      resetForm();
      fetchLocations();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save location"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");

      toast.success("Location removed");
      fetchLocations();
    } catch {
      toast.error("Failed to delete location");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Save locations for smarter task recommendations.
        </p>
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {locations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            No saved locations yet.
          </p>
          <p className="text-xs text-muted-foreground">
            Add places like Home, Campus, or Work.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {locations.map((loc) => (
            <Card key={loc.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{loc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {loc.radiusMeters ?? 200}m radius
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openEdit(loc)}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleDelete(loc.id)}
                  disabled={deletingId === loc.id}
                >
                  {deletingId === loc.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Location" : "Add Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loc-name">Name</Label>
              <Input
                id="loc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Home, Campus, Work"
                autoFocus
              />
            </div>

            {/* Address search */}
            <div className="space-y-2">
              <Label>Address</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder="Search an address..."
                  className="pl-9"
                />
                {search.isSearching && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search results dropdown */}
              {search.results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                  {search.results.map((result) => (
                    <button
                      key={result.place_id}
                      onClick={() => selectSearchResult(result)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-2">
                        {result.display_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Coordinates display */}
              {latitude && longitude && (
                <p className="text-xs text-muted-foreground">
                  {latitude}, {longitude}
                </p>
              )}
            </div>

            {/* GPS fallback */}
            <Button
              variant="outline"
              size="sm"
              onClick={detectCurrentPosition}
              disabled={isDetecting}
              className="w-full"
            >
              {isDetecting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="mr-1.5 h-3.5 w-3.5" />
              )}
              Use Current Position
            </Button>

            <div className="space-y-2">
              <Label htmlFor="loc-radius">Radius (meters)</Label>
              <Input
                id="loc-radius"
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(e.target.value)}
                type="number"
                min="50"
                max="5000"
              />
              <p className="text-xs text-muted-foreground">
                How close you need to be to match this location.
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {editingId ? "Save Changes" : "Add Location"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
