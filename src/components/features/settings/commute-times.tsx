"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, Loader2, Route, Car, Footprints, Bike } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type TravelMode = "driving" | "walking" | "cycling";

interface SavedLocation {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
}

interface CommuteTime {
  fromLocationId: string;
  toLocationId: string;
  travelMinutes: number;
}

interface EstimateResult {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  minutes: number | null;
  distanceKm: number | null;
  error: string | null;
}

const MODE_ICONS: Record<TravelMode, typeof Car> = {
  driving: Car,
  walking: Footprints,
  cycling: Bike,
};

const MODE_LABELS: Record<TravelMode, string> = {
  driving: "Drive",
  walking: "Walk",
  cycling: "Bike",
};

export function CommuteTimes() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [commuteTimes, setCommuteTimes] = useState<CommuteTime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingPair, setSavingPair] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [estimatingPair, setEstimatingPair] = useState<string | null>(null);
  const [estimatingAll, setEstimatingAll] = useState(false);
  // Track input values keyed by pairKey for controlled updates after estimate
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchData = useCallback(async () => {
    try {
      const [locRes, ctRes] = await Promise.all([
        fetch("/api/locations"),
        fetch("/api/locations/commute-times"),
      ]);
      if (locRes.ok) {
        const data = await locRes.json();
        setLocations(data.locations ?? []);
      }
      if (ctRes.ok) {
        const data = await ctRes.json();
        setCommuteTimes(data.commuteTimes ?? []);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getMinutes = (fromId: string, toId: string): number | "" => {
    const ct = commuteTimes.find(
      (c) => c.fromLocationId === fromId && c.toLocationId === toId
    );
    return ct ? ct.travelMinutes : "";
  };

  const handleSave = async (fromId: string, toId: string, value: string) => {
    const pairKey = `${fromId}-${toId}`;
    const minutes = parseInt(value, 10);

    // If empty or 0, delete the commute time
    if (!value || minutes === 0) {
      setSavingPair(pairKey);
      try {
        await fetch(`/api/locations/commute-times?from=${fromId}&to=${toId}`, {
          method: "DELETE",
        });
        setCommuteTimes((prev) =>
          prev.filter(
            (c) =>
              !(
                (c.fromLocationId === fromId && c.toLocationId === toId) ||
                (c.fromLocationId === toId && c.toLocationId === fromId)
              )
          )
        );
      } finally {
        setSavingPair(null);
      }
      return;
    }

    if (isNaN(minutes) || minutes < 0) return;

    setSavingPair(pairKey);
    try {
      const res = await fetch("/api/locations/commute-times", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLocationId: fromId,
          toLocationId: toId,
          travelMinutes: minutes,
        }),
      });
      if (res.ok) {
        // Update both directions in local state
        setCommuteTimes((prev) => {
          const filtered = prev.filter(
            (c) =>
              !(
                (c.fromLocationId === fromId && c.toLocationId === toId) ||
                (c.fromLocationId === toId && c.toLocationId === fromId)
              )
          );
          return [
            ...filtered,
            { fromLocationId: fromId, toLocationId: toId, travelMinutes: minutes },
            { fromLocationId: toId, toLocationId: fromId, travelMinutes: minutes },
          ];
        });
        toast.success("Commute time saved");
      }
    } catch {
      toast.error("Failed to save commute time");
    } finally {
      setSavingPair(null);
    }
  };

  const hasCoordinates = (loc: SavedLocation): boolean =>
    loc.latitude != null && loc.longitude != null;

  const estimatePair = async (
    from: SavedLocation,
    to: SavedLocation
  ): Promise<number | null> => {
    if (!hasCoordinates(from) || !hasCoordinates(to)) return null;

    const res = await fetch("/api/locations/commute-times/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairs: [
          {
            fromLat: parseFloat(from.latitude!),
            fromLng: parseFloat(from.longitude!),
            toLat: parseFloat(to.latitude!),
            toLng: parseFloat(to.longitude!),
          },
        ],
        mode: travelMode,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const estimate: EstimateResult = data.estimates?.[0];
    if (!estimate || estimate.error || estimate.minutes == null) return null;

    return estimate.minutes;
  };

  const handleEstimatePair = async (from: SavedLocation, to: SavedLocation) => {
    const pairKey = `${from.id}-${to.id}`;
    setEstimatingPair(pairKey);

    try {
      const minutes = await estimatePair(from, to);
      if (minutes == null) {
        toast.error(`Couldn't estimate route: ${from.name} → ${to.name}`);
        return;
      }

      // Auto-save the estimated time
      await handleSave(from.id, to.id, minutes.toString());

      // Update the input field value
      const input = inputRefs.current[pairKey];
      if (input) input.value = minutes.toString();

      toast.success(
        `${from.name} ↔ ${to.name}: ~${minutes} min (${MODE_LABELS[travelMode].toLowerCase()})`
      );
    } catch {
      toast.error("Failed to estimate commute time");
    } finally {
      setEstimatingPair(null);
    }
  };

  const handleEstimateAll = async (
    pairs: Array<{ from: SavedLocation; to: SavedLocation }>
  ) => {
    // Filter to pairs that have coordinates
    const estimatable = pairs.filter(
      ({ from, to }) => hasCoordinates(from) && hasCoordinates(to)
    );

    if (estimatable.length === 0) {
      toast.error("No locations have coordinates set");
      return;
    }

    setEstimatingAll(true);

    try {
      const res = await fetch("/api/locations/commute-times/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairs: estimatable.map(({ from, to }) => ({
            fromLat: parseFloat(from.latitude!),
            fromLng: parseFloat(from.longitude!),
            toLat: parseFloat(to.latitude!),
            toLng: parseFloat(to.longitude!),
          })),
          mode: travelMode,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to estimate commute times");
        return;
      }

      const data = await res.json();
      const estimates: EstimateResult[] = data.estimates ?? [];

      let savedCount = 0;

      // Save each successful estimate
      for (let i = 0; i < estimates.length; i++) {
        const estimate = estimates[i];
        const pair = estimatable[i];

        if (estimate.error || estimate.minutes == null) continue;

        await handleSave(pair.from.id, pair.to.id, estimate.minutes.toString());

        // Update input field
        const pairKey = `${pair.from.id}-${pair.to.id}`;
        const input = inputRefs.current[pairKey];
        if (input) input.value = estimate.minutes.toString();

        savedCount++;
      }

      if (savedCount > 0) {
        toast.success(
          `Estimated ${savedCount} commute time${savedCount > 1 ? "s" : ""} via ${MODE_LABELS[travelMode].toLowerCase()}`
        );
      } else {
        toast.error("No routes could be estimated");
      }
    } catch {
      toast.error("Failed to estimate commute times");
    } finally {
      setEstimatingAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (locations.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Commute Times
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add at least 2 saved locations to set commute times between them.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Build unique pairs (A→B only, not B→A since they're symmetric)
  const pairs: Array<{ from: SavedLocation; to: SavedLocation }> = [];
  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      pairs.push({ from: locations[i], to: locations[j] });
    }
  }

  const canEstimate = pairs.some(
    ({ from, to }) => hasCoordinates(from) && hasCoordinates(to)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Commute Times
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          How long does it take to get between your locations? Used for
          scheduling and crisis mode planning.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Travel mode selector + Estimate All */}
        {canEstimate && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              {(Object.keys(MODE_ICONS) as TravelMode[]).map((mode) => {
                const Icon = MODE_ICONS[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTravelMode(mode)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                      travelMode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    title={MODE_LABELS[mode]}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{MODE_LABELS[mode]}</span>
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleEstimateAll(pairs)}
              disabled={estimatingAll || estimatingPair !== null}
              className="text-xs gap-1.5"
            >
              {estimatingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Route className="h-3.5 w-3.5" />
              )}
              Estimate All
            </Button>
          </div>
        )}

        {/* Pair list */}
        {pairs.map(({ from, to }) => {
          const pairKey = `${from.id}-${to.id}`;
          const currentVal = getMinutes(from.id, to.id);
          const pairCanEstimate =
            hasCoordinates(from) && hasCoordinates(to);
          const isEstimating = estimatingPair === pairKey || estimatingAll;

          return (
            <div key={pairKey} className="flex items-center gap-3">
              <span className="text-sm min-w-0 flex-1 truncate">
                {from.name} ↔ {to.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
                  ref={(el) => {
                    inputRefs.current[pairKey] = el;
                  }}
                  type="number"
                  min={0}
                  placeholder="—"
                  className="w-16 h-8 text-center text-sm"
                  defaultValue={currentVal}
                  onBlur={(e) => handleSave(from.id, to.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">min</span>
                {pairCanEstimate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEstimatePair(from, to)}
                    disabled={isEstimating}
                    title={`Estimate via ${MODE_LABELS[travelMode].toLowerCase()}`}
                  >
                    {isEstimating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Route className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
                {savingPair === pairKey && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
