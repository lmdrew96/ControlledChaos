"use client";

import { useState, useEffect, useCallback } from "react";
import { useAddressSearch } from "@/hooks/use-address-search";
import type { NominatimResult } from "@/hooks/use-address-search";
import dynamic from "next/dynamic";
import {
  MapPin,
  Plus,
  Trash2,
  Loader2,
  Navigation,
  Search,
  Pencil,
  House,
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
// Leaflet CSS must be imported globally for the map to render correctly
import "leaflet/dist/leaflet.css";

// Dynamic import — Leaflet cannot run on the server
const LocationMap = dynamic(
  () => import("./location-map").then((m) => ({ default: m.LocationMap })),
  { ssr: false, loading: () => <div className="h-64 w-full rounded-lg border border-border bg-muted/30 animate-pulse" /> }
);

interface SavedLocation {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  isHome: boolean;
}

export function SavedLocations() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [homeTogglingId, setHomeTogglingId] = useState<string | null>(null);
  // Bumped each time data changes so the map remounts with fresh pins
  const [mapKey, setMapKey] = useState(0);

  // Form state
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
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
        setMapKey((k) => k + 1); // remount map with fresh pins
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLocations();
  }, [fetchLocations]);

  function resetForm() {
    setName("");
    setLatitude("");
    setLongitude("");
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
      void fetchLocations();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save location"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleHome(loc: SavedLocation) {
    setHomeTogglingId(loc.id);
    try {
      const res = await fetch(`/api/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHome: !loc.isHome }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success(loc.isHome ? `${loc.name} is no longer home` : `${loc.name} is now home`);
      void fetchLocations();
    } catch {
      toast.error("Failed to update home");
    } finally {
      setHomeTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");

      toast.success("Location removed");
      void fetchLocations();
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
          Calendar events match these by name, so travel time and leave-now
          alerts know where you&apos;re headed. Mark one as home: that&apos;s
          where you are before your first event of the day.
        </p>
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Map — always shown; empty state is handled inside */}
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
        <>
          {/* Interactive map — remounts when locations change */}
          <LocationMap
            key={mapKey}
            locations={locations}
            onSelect={openEdit}
          />

          {/* Compact location list below the map */}
          <div className="space-y-1.5">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                {loc.isHome ? (
                  <House className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate block">
                    {loc.name}
                    {loc.isHome && (
                      <span className="ml-1.5 text-xs font-normal text-primary">Home</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {loc.latitude && loc.longitude
                      ? `${parseFloat(loc.latitude).toFixed(4)}, ${parseFloat(loc.longitude).toFixed(4)}`
                      : "No coordinates"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={loc.isHome ? "h-9 w-9 text-primary hover:text-primary" : "h-9 w-9"}
                    onClick={() => toggleHome(loc)}
                    disabled={homeTogglingId === loc.id}
                    aria-label={loc.isHome ? `Unmark ${loc.name} as home` : `Mark ${loc.name} as home`}
                    aria-pressed={loc.isHome}
                  >
                    {homeTogglingId === loc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <House className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => openEdit(loc)}
                    aria-label={`Edit ${loc.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(loc.id)}
                    disabled={deletingId === loc.id}
                    aria-label={`Delete ${loc.name}`}
                  >
                    {deletingId === loc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
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
