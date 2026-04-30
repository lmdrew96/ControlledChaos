"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fireTaskConfetti } from "@/lib/utils/confetti";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useRecommendation } from "@/hooks/use-recommendation";
import { useParallelPlaySync } from "@/hooks/use-parallel-play-sync";
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
    clearRecommendation,
  } = useRecommendation();

  const [energyOverride, setEnergyOverride] = useState<
    EnergyLevel | undefined
  >();
  const [energyDismissed, setEnergyDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // If a recommendation was persisted from a previous session, treat as already requested
  const [hasRequested, setHasRequested] = useState(!!recommendation);
  const hasFetched = useRef(!!recommendation);

  const { syncTaskStart, syncTaskComplete } = useParallelPlaySync();
  const lastSyncedTaskIdRef = useRef<string | null>(null);

  // When a fresh recommendation lands, broadcast it to the room as the
  // user's active task. Treats the moment of seeing the recommendation as
  // the implicit "start" — CC has no separate Start Now button.
  useEffect(() => {
    const task = recommendation?.task;
    if (!task) return;
    if (lastSyncedTaskIdRef.current === task.id) return;
    lastSyncedTaskIdRef.current = task.id;
    void syncTaskStart(task);
  }, [recommendation?.task, syncTaskStart]);

  // Fetch recommendation only when user has explicitly requested it
  const triggerRecommendation = useCallback(() => {
    setHasRequested(true);
    hasFetched.current = true;
    // Request location — if already available, send it now;
    // otherwise the useEffect below will re-fetch once coords arrive
    requestLocation();
    if (latitude != null && longitude != null) {
      fetchRecommendation({ latitude, longitude, energyOverride });
    } else {
      // No location yet — fetch without it; re-fetch triggers when location arrives
      fetchRecommendation({ energyOverride });
    }
  }, [fetchRecommendation, latitude, longitude, energyOverride, requestLocation]);

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
      void syncTaskComplete();
      lastSyncedTaskIdRef.current = null;
      const taskTitle = recommendation?.task?.title;
      toast.success(taskTitle ? `'${taskTitle}' marked complete` : "Task completed!");
      fireTaskConfetti();
      // Reset card to idle state — user gets the completion beat,
      // then explicitly asks for the next recommendation.
      clearRecommendation();
      setHasRequested(false);
      hasFetched.current = false;
    },
    [sendFeedback, syncTaskComplete, clearRecommendation, recommendation?.task?.title]
  );

  const handleSnooze = useCallback(
    async (taskId: string) => {
      setIsRefreshing(true);
      try {
        const res = await fetch("/api/recommend/snooze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        });

        if (res.ok) {
          const { snoozeMinutes, reason } = await res.json() as {
            snoozeMinutes: number;
            reason: string;
          };
          const durationLabel =
            snoozeMinutes < 60
              ? `${snoozeMinutes} min`
              : snoozeMinutes % 60 === 0
                ? `${snoozeMinutes / 60}h`
                : `${Math.floor(snoozeMinutes / 60)}h ${snoozeMinutes % 60}m`;
          toast(`Snoozed ${durationLabel} — ${reason}`);
        } else {
          // Fallback: old feedback path
          await sendFeedback(taskId, "snoozed");
          toast("Snoozed. Here's something else.");
        }
      } catch {
        await sendFeedback(taskId, "snoozed");
        toast("Snoozed. Here's something else.");
      }
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

  // Idle state — user hasn't asked yet. Compact inline CTA, no card.
  if (!hasRequested) {
    return (
      <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Button onClick={triggerRecommendation} size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" />
          What should I do next?
        </Button>
        <p className="text-xs text-muted-foreground sm:text-sm">
          I&apos;ll pick one for right now.
        </p>
      </div>
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
