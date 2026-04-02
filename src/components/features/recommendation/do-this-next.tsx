"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import confetti from "canvas-confetti";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
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
  const [hasRequested, setHasRequested] = useState(false);
  const hasFetched = useRef(false);

  // Request location on mount so it's ready when user asks
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Fetch recommendation only when user has explicitly requested it
  const triggerRecommendation = useCallback(() => {
    setHasRequested(true);
    hasFetched.current = true;
    fetchRecommendation({
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      energyOverride,
    });
  }, [fetchRecommendation, latitude, longitude, energyOverride]);

  // Re-fetch when location arrives (only if user already requested)
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
      // Mark task as completed
      try {
        await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        });
      } catch {
        // feedback still fires below
      }
      await sendFeedback(taskId, "completed");
      toast.success("Task completed!");
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.65 }, colors: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43"] });
      setTimeout(() => {
        confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff"] });
        confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ["#ff9f43","#c77dff","#4d96ff","#6bcb77","#ffd93d"] });
      }, 150);
      setTimeout(() => {
        confetti({ particleCount: 60, spread: 120, startVelocity: 45, decay: 0.92, origin: { y: 0.5 }, colors: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43"] });
      }, 350);
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

  // Idle state — user hasn't asked yet
  if (!hasRequested) {
    return (
      <Card className="border-primary/20 bg-primary/5 overflow-hidden">
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Logo className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Need a nudge?</p>
              <p className="text-sm text-muted-foreground">
                I&apos;ll pick the best task for right now.
              </p>
            </div>
          </div>
          <Button onClick={triggerRecommendation} className="w-full sm:w-auto gap-2">
            <Sparkles className="h-4 w-4" />
            What should I do?
          </Button>
        </CardContent>
      </Card>
    );
  }

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
      <div aria-live="polite">
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
    </div>
  );
}
