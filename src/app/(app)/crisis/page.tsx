"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, ChevronLeft, Siren, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CrisisIntakeForm } from "@/components/features/crisis/crisis-intake-form";
import { CrisisWarRoom } from "@/components/features/crisis/crisis-war-room";
import { CrisisStrategyPicker } from "@/components/features/crisis/crisis-strategy-picker";
import { CrisisDone } from "@/components/features/crisis/crisis-done";
import { cn } from "@/lib/utils";
import type { CrisisPlan, CrisisStrategy, CrisisFileAttachment, PanicLevel } from "@/types";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface ActivePlanData {
  id: string;
  taskName: string;
  deadline: string;
  panicLevel: PanicLevel;
  panicLabel: string;
  plan: CrisisPlan & { currentTaskIndex: number };
}

type Phase =
  | "loading"         // initial fetch
  | "dashboard"       // list of all active sessions
  | "intake"          // new crisis form
  | "generating"      // AI generating plan
  | "strategy"        // pick from multiple strategy options
  | "active"          // war room for a specific plan
  | "done";           // just completed a plan

interface StrategyPickerState {
  strategies: CrisisStrategy[];
  taskName: string;
  deadline: string;
  completionPct: number;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function panicColor(level: PanicLevel) {
  if (level === "damage-control") return "text-destructive border-destructive/40 bg-destructive/5";
  if (level === "tight") return "text-amber-500 border-amber-500/40 bg-amber-500/5";
  return "text-emerald-500 border-emerald-500/40 bg-emerald-500/5";
}

function formatDeadline(isoString: string) {
  return new Date(isoString).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function timeLeftLabel(isoString: string): string {
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return "Past due";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function progressPct(plan: ActivePlanData): number {
  return Math.round(
    (plan.plan.currentTaskIndex / plan.plan.tasks.length) * 100
  );
}

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export default function CrisisPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [plans, setPlans] = useState<ActivePlanData[]>([]);
  const [activePlan, setActivePlan] = useState<ActivePlanData | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [completedTaskName, setCompletedTaskName] = useState<string | null>(null);
  const [abandoningId, setAbandoningId] = useState<string | null>(null);
  const [strategyState, setStrategyState] = useState<StrategyPickerState | null>(null);

  // -------------------------------------------------------
  // Load all active plans
  // -------------------------------------------------------
  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch("/api/crisis");
      if (!res.ok) throw new Error();
      const data = await res.json();

      const mapped: ActivePlanData[] = (data.plans ?? []).map(
        (p: {
          id: string;
          taskName: string;
          deadline: string | Date;
          panicLevel: PanicLevel;
          panicLabel: string;
          summary: string;
          tasks: CrisisPlan["tasks"];
          currentTaskIndex: number;
        }) => ({
          id: p.id,
          taskName: p.taskName,
          deadline: new Date(p.deadline).toISOString(),
          panicLevel: p.panicLevel,
          panicLabel: p.panicLabel,
          plan: {
            panicLevel: p.panicLevel,
            panicLabel: p.panicLabel,
            summary: p.summary,
            tasks: p.tasks,
            currentTaskIndex: p.currentTaskIndex ?? 0,
          },
        })
      );

      setPlans(mapped);
      setPhase(mapped.length === 0 ? "intake" : "dashboard");
    } catch {
      setPhase("intake");
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // -------------------------------------------------------
  // Handlers
  // -------------------------------------------------------

  async function handleNewCrisis(data: {
    taskName: string;
    deadline: string;
    completionPct: number;
    files: CrisisFileAttachment[];
  }) {
    setIntakeError(null);
    setPhase("generating");

    try {
      const res = await fetch("/api/crisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to generate crisis plan");
      }

      const body = await res.json();

      // AI returned multiple strategies — let the user pick
      if (body.strategies) {
        setStrategyState({
          strategies: body.strategies,
          taskName: data.taskName,
          deadline: data.deadline,
          completionPct: data.completionPct,
        });
        setPhase("strategy");
        return;
      }

      const newPlan: ActivePlanData = {
        id: body.id,
        taskName: data.taskName,
        deadline: new Date(data.deadline).toISOString(),
        panicLevel: body.plan.panicLevel,
        panicLabel: body.plan.panicLabel,
        plan: { ...body.plan, currentTaskIndex: body.plan.currentTaskIndex ?? 0 },
      };

      setActivePlan(newPlan);
      setPlans((prev) => [newPlan, ...prev]);
      setPhase("active");
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("intake");
    }
  }

  function handleEnterWarRoom(plan: ActivePlanData) {
    setActivePlan(plan);
    setPhase("active");
  }

  function handleWarRoomComplete() {
    if (!activePlan) return;
    setCompletedTaskName(activePlan.taskName);
    setPlans((prev) => prev.filter((p) => p.id !== activePlan.id));
    setActivePlan(null);
    setPhase("done");
  }

  async function handleAbandon(planId: string) {
    setAbandoningId(planId);
    try {
      await fetch(`/api/crisis?planId=${planId}`, { method: "DELETE" });
      setPlans((prev) => prev.filter((p) => p.id !== planId));
    } finally {
      setAbandoningId(null);
    }
  }

  async function handleStrategySelect(strategy: CrisisStrategy) {
    if (!strategyState) return;
    setPhase("generating");

    try {
      const res = await fetch("/api/crisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName: strategyState.taskName,
          deadline: strategyState.deadline,
          completionPct: strategyState.completionPct,
          selectedPlan: strategy.plan,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to save crisis plan");
      }

      const body = await res.json();
      const newPlan: ActivePlanData = {
        id: body.id,
        taskName: strategyState.taskName,
        deadline: new Date(strategyState.deadline).toISOString(),
        panicLevel: body.plan.panicLevel,
        panicLabel: body.plan.panicLabel,
        plan: { ...body.plan, currentTaskIndex: body.plan.currentTaskIndex ?? 0 },
      };

      setActivePlan(newPlan);
      setPlans((prev) => [newPlan, ...prev]);
      setStrategyState(null);
      setPhase("active");
    } catch (err) {
      setIntakeError(err instanceof Error ? err.message : "Something went wrong");
      setStrategyState(null);
      setPhase("intake");
    }
  }

  function handleDoneNext() {
    // After completing, go to dashboard if there are remaining plans, else new intake
    setPhase(plans.length > 0 ? "dashboard" : "intake");
    setCompletedTaskName(null);
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  if (phase === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "generating") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-lg font-medium">Reading the situation...</p>
      </div>
    );
  }

  if (phase === "strategy" && strategyState) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <CrisisStrategyPicker
          strategies={strategyState.strategies}
          onSelect={handleStrategySelect}
        />
      </div>
    );
  }

  if (phase === "done" && completedTaskName) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <CrisisDone taskName={completedTaskName} />
        {plans.length > 0 && (
          <Button variant="outline" className="w-full" onClick={handleDoneNext}>
            Back to active sessions
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => {
            setPhase("intake");
            setCompletedTaskName(null);
          }}
        >
          Start a new crisis session
        </Button>
      </div>
    );
  }

  if (phase === "active" && activePlan) {
    return (
      <div className="space-y-4">
        {/* Back to dashboard — only show if there are other active plans */}
        {plans.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => {
              setActivePlan(null);
              setPhase("dashboard");
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            All sessions
          </Button>
        )}
        <div className="max-w-xl">
          <CrisisWarRoom
            plan={activePlan.plan}
            planId={activePlan.id}
            taskName={activePlan.taskName}
            deadline={activePlan.deadline}
            onComplete={handleWarRoomComplete}
            onReassess={(newPlan) => {
              const updated: ActivePlanData = {
                ...activePlan,
                panicLevel: newPlan.panicLevel,
                panicLabel: newPlan.panicLabel,
                plan: newPlan,
              };
              setActivePlan(updated);
              setPlans((prev) => prev.map((p) => p.id === updated.id ? updated : p));
            }}
          />
        </div>
      </div>
    );
  }

  if (phase === "intake") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        {/* Header with back button if there are existing plans */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Crisis Mode</h1>
            <p className="mt-1 text-muted-foreground">
              Behind on something? Let&apos;s figure out a path forward.
            </p>
          </div>
          {plans.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setPhase("dashboard")}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Button>
          )}
        </div>

        {intakeError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {intakeError}
          </div>
        )}
        <CrisisIntakeForm onSubmit={handleNewCrisis} />
      </div>
    );
  }

  // -------------------------------------------------------
  // Dashboard — all active plans
  // -------------------------------------------------------
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Crisis Mode</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {plans.length} active session{plans.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setPhase("intake")}>
          <Plus className="mr-1.5 h-4 w-4" />
          New session
        </Button>
      </div>

      <div className="space-y-3">
        {plans.map((plan) => {
          const pct = progressPct(plan);
          return (
            <Card
              key={plan.id}
              className={cn(
                "border transition-colors cursor-pointer hover:bg-accent/30",
                panicColor(plan.panicLevel)
              )}
              onClick={() => handleEnterWarRoom(plan)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Siren className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="font-semibold truncate">{plan.taskName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="outline"
                      className={cn("text-xs", panicColor(plan.panicLevel))}
                    >
                      {plan.panicLabel}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbandon(plan.id);
                      }}
                      disabled={abandoningId === plan.id}
                      aria-label={`Abandon ${plan.taskName}`}
                    >
                      {abandoningId === plan.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs opacity-70">
                    <span>
                      Step {plan.plan.currentTaskIndex + 1} of {plan.plan.tasks.length}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-current/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-current/40 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Deadline */}
                <div className="mt-2 flex items-center justify-between text-xs opacity-60">
                  <span>Due {formatDeadline(plan.deadline)}</span>
                  <span className="font-medium">{timeLeftLabel(plan.deadline)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
