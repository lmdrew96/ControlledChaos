"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useRecommendation } from "@/hooks/use-recommendation";
import { EnergyCheck } from "./energy-check";
import { RecommendationCard } from "./recommendation-card";
import { RecommendationSkeleton } from "./recommendation-skeleton";
import { RecommendationEmptyState } from "./empty-state";
import type { EnergyLevel } from "@/types";

export function DoThisNext() {
  const { latitude, longitude, requestLocation } = useGeolocation();
  const {
    recommendation,
    isLoading,
    error,
    message,
    fetchRecommendation,
    sendFeedback,
  } = useRecommendation();

  const [energyOverride, setEnergyOverride] = useState<
    EnergyLevel | undefined
  >();
  const [energyDismissed, setEnergyDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasFetched = useRef(false);

  // Request location on mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Fetch recommendation once we have location (or after timeout)
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    // Small delay to let geolocation settle, then fetch regardless
    const timer = setTimeout(() => {
      fetchRecommendation({
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        energyOverride,
      });
    }, 500);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when location arrives (if it wasn't available on first fetch)
  useEffect(() => {
    if (latitude != null && longitude != null && hasFetched.current) {
      fetchRecommendation({
        latitude,
        longitude,
        energyOverride,
      });
    }
  }, [latitude, longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(
    async (overrideEnergy?: EnergyLevel) => {
      setIsRefreshing(true);
      await fetchRecommendation({
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        energyOverride: overrideEnergy ?? energyOverride,
      });
      setIsRefreshing(false);
    },
    [fetchRecommendation, latitude, longitude, energyOverride]
  );

  const handleEnergySelect = useCallback(
    (level: EnergyLevel) => {
      setEnergyOverride(level);
      setEnergyDismissed(true);
      refresh(level);
    },
    [refresh]
  );

  const handleEnergyDismiss = useCallback(() => {
    setEnergyDismissed(true);
  }, []);

  const handleAccept = useCallback(
    async (taskId: string) => {
      setIsRefreshing(true);
      await sendFeedback(taskId, "accepted");
      toast.success("Let's do it! Task started.");
      await refresh();
    },
    [sendFeedback, refresh]
  );

  const handleSnooze = useCallback(
    async (taskId: string) => {
      setIsRefreshing(true);
      await sendFeedback(taskId, "snoozed");
      toast("Snoozed. Here's something else.");
      await refresh();
    },
    [sendFeedback, refresh]
  );

  const handleReject = useCallback(
    async (taskId: string) => {
      await sendFeedback(taskId, "rejected");
    },
    [sendFeedback]
  );

  const handleSelectAlternative = useCallback(
    async (taskId: string) => {
      setIsRefreshing(true);
      await sendFeedback(taskId, "accepted");
      toast.success("Good pick! Task started.");
      await refresh();
    },
    [sendFeedback, refresh]
  );

  // Loading state
  if (isLoading && !recommendation) {
    return <RecommendationSkeleton />;
  }

  // Error state
  if (error && !recommendation) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Couldn&apos;t load recommendation
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh()}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  // No tasks state
  if (!recommendation) {
    return <RecommendationEmptyState message={message ?? undefined} />;
  }

  return (
    <div className="space-y-3">
      {/* Energy self-report (optional, one-time per session) */}
      {!energyDismissed && (
        <EnergyCheck
          onSelect={handleEnergySelect}
          onDismiss={handleEnergyDismiss}
          selected={energyOverride}
        />
      )}

      {/* The hero recommendation card */}
      <RecommendationCard
        task={recommendation.task}
        reasoning={recommendation.reasoning}
        alternatives={recommendation.alternatives}
        onAccept={handleAccept}
        onSnooze={handleSnooze}
        onReject={handleReject}
        onSelectAlternative={handleSelectAlternative}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}
