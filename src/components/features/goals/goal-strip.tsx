"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flag, PartyPopper, Target } from "lucide-react";
import { useCrisisDetection } from "@/hooks/use-crisis-detection";
import type { Goal } from "@/types";
import { isReadyToFinish } from "./goal-meta";

/**
 * Dashboard: your top three active goals (by the order you set on /goals),
 * each with its next step. Quiet on purpose — the recommendation is the loud
 * surface. Hidden with no active goals, and in Crisis Mode.
 */
export function GoalStrip() {
  const { isActive: crisisActive } = useCrisisDetection();
  const [goals, setGoals] = useState<Goal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/goals?status=active")
      .then((res) => {
        if (!res.ok) throw new Error(`GET /api/goals ${res.status}`);
        return res.json();
      })
      .then((data: { goals?: Goal[] }) => {
        if (!cancelled) setGoals((data.goals ?? []).slice(0, 3));
      })
      .catch((error) => {
        // A dashboard extra: log it and stay hidden rather than show an error.
        console.error("Failed to load dashboard goals:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (crisisActive || !goals || goals.length === 0) return null;

  return (
    <section aria-labelledby="goal-strip-heading" className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 id="goal-strip-heading" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Target className="h-3.5 w-3.5" />
          Toward your goals
        </h2>
        <Link href="/goals" className="text-xs text-muted-foreground hover:text-foreground">
          All goals
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {goals.map((goal) => (
          <Link
            key={goal.id}
            href={`/goals/${goal.id}`}
            className="min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent/40"
          >
            <p className="text-sm font-medium leading-snug line-clamp-2 break-words">{goal.title}</p>
            <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              {isReadyToFinish(goal) ? (
                <>
                  <PartyPopper className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">Every step done</span>
                </>
              ) : goal.nextStep ? (
                <>
                  <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
                  <span className="truncate">{goal.nextStep.title}</span>
                </>
              ) : (
                <>
                  <Flag className="h-3 w-3 shrink-0" />
                  <span className="truncate">Pick a first step</span>
                </>
              )}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
