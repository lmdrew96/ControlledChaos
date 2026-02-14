"use client";

import { useState, useCallback } from "react";
import type { Task, EnergyLevel } from "@/types";

interface RecommendationResult {
  taskId: string;
  reasoning: string;
  task: Task;
  alternatives: Array<{
    taskId: string;
    reasoning: string;
    task: Task | null;
  }>;
}

interface ContextInfo {
  energyLevel: EnergyLevel;
  location: string | null;
  minutesUntilNextEvent: number | null;
  pendingTaskCount: number;
}

interface RecommendationState {
  recommendation: RecommendationResult | null;
  isLoading: boolean;
  error: string | null;
  contextInfo: ContextInfo | null;
  message: string | null;
}

export function useRecommendation() {
  const [state, setState] = useState<RecommendationState>({
    recommendation: null,
    isLoading: false,
    error: null,
    contextInfo: null,
    message: null,
  });

  const fetchRecommendation = useCallback(
    async (params?: {
      latitude?: number;
      longitude?: number;
      energyOverride?: EnergyLevel;
    }) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const res = await fetch("/api/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: params?.latitude,
            longitude: params?.longitude,
            energyOverride: params?.energyOverride,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to get recommendation");
        }

        const data = await res.json();

        setState({
          recommendation: data.recommendation,
          isLoading: false,
          error: null,
          contextInfo: data.context ?? null,
          message: data.message ?? null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Something went wrong",
        }));
      }
    },
    []
  );

  const sendFeedback = useCallback(
    async (
      taskId: string,
      action: "accepted" | "snoozed" | "rejected" | "completed"
    ) => {
      try {
        const res = await fetch("/api/recommend/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, action }),
        });

        if (!res.ok) {
          console.error("Feedback request failed:", res.status);
        }
      } catch (err) {
        console.error("Failed to send feedback:", err);
      }
    },
    []
  );

  return {
    ...state,
    fetchRecommendation,
    sendFeedback,
  };
}
