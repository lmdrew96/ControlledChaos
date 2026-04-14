"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SavedLocation {
  id: string;
  name: string;
}

interface CommuteTime {
  fromLocationId: string;
  toLocationId: string;
  travelMinutes: number;
}

export function CommuteTimes() {
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [commuteTimes, setCommuteTimes] = useState<CommuteTime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingPair, setSavingPair] = useState<string | null>(null);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Commute Times
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          How long does it take to get between your locations? Used for scheduling and crisis mode planning.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pairs.map(({ from, to }) => {
          const pairKey = `${from.id}-${to.id}`;
          const currentVal = getMinutes(from.id, to.id);
          return (
            <div key={pairKey} className="flex items-center gap-3">
              <span className="text-sm min-w-0 flex-1 truncate">
                {from.name} ↔ {to.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Input
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
