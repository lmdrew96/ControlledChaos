"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrisisIntakeForm } from "@/components/features/crisis/crisis-intake-form";
import { CrisisWarRoom } from "@/components/features/crisis/crisis-war-room";
import { CrisisDone } from "@/components/features/crisis/crisis-done";
import type { CrisisPlan, CrisisFileAttachment } from "@/types";

type Phase = "check" | "resume-prompt" | "intake" | "loading" | "active" | "done";

interface ActivePlanData {
  id: string;
  taskName: string;
  deadline: string;
  plan: CrisisPlan & { currentTaskIndex: number };
}

export default function CrisisPage() {
  const [phase, setPhase] = useState<Phase>("check");
  const [activePlan, setActivePlan] = useState<ActivePlanData | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<
    (CrisisPlan & { currentTaskIndex: number }) | null
  >(null);
  const [intakeData, setIntakeData] = useState<{
    taskName: string;
    deadline: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for active plan on mount
  useEffect(() => {
    async function checkActivePlan() {
      try {
        const res = await fetch("/api/crisis");
        if (!res.ok) throw new Error("Failed to check for active plan");
        const data = await res.json();

        if (data.plan) {
          setActivePlan({
            id: data.plan.id,
            taskName: data.plan.taskName,
            deadline: data.plan.deadline,
            plan: {
              panicLevel: data.plan.panicLevel,
              panicLabel: data.plan.panicLabel,
              summary: data.plan.summary,
              tasks: data.plan.tasks,
              currentTaskIndex: data.plan.currentTaskIndex ?? 0,
            },
          });
          setPhase("resume-prompt");
        } else {
          setPhase("intake");
        }
      } catch {
        setPhase("intake");
      }
    }

    checkActivePlan();
  }, []);

  async function handleSubmit(data: {
    taskName: string;
    deadline: string;
    completionPct: number;
    files: CrisisFileAttachment[];
  }) {
    setIntakeData({ taskName: data.taskName, deadline: data.deadline });
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/crisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskName: data.taskName,
          deadline: data.deadline,
          completionPct: data.completionPct,
          files: data.files,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to generate crisis plan");
      }

      const body = await res.json();
      setCurrentPlanId(body.id);
      setCurrentPlan({
        ...body.plan,
        currentTaskIndex: body.plan.currentTaskIndex ?? 0,
      });
      setPhase("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("intake");
    }
  }

  function handleResume() {
    if (!activePlan) return;
    setCurrentPlanId(activePlan.id);
    setCurrentPlan(activePlan.plan);
    setIntakeData({
      taskName: activePlan.taskName,
      deadline: activePlan.deadline,
    });
    setPhase("active");
  }

  if (phase === "check") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "resume-prompt" && activePlan) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Crisis Mode</h1>
          <p className="mt-1 text-muted-foreground">
            You have an unfinished session.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {activePlan.taskName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Resume where you left off — task {(activePlan.plan.currentTaskIndex ?? 0) + 1} of{" "}
              {activePlan.plan.tasks.length}.
            </p>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleResume}>
                Resume session
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPhase("intake")}
              >
                Start new
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "intake") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Crisis Mode</h1>
          <p className="mt-1 text-muted-foreground">
            Behind on something? Let&apos;s figure out a path forward.
          </p>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <CrisisIntakeForm onSubmit={handleSubmit} />
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-lg font-medium">Reading the situation...</p>
      </div>
    );
  }

  if (phase === "active" && currentPlan && currentPlanId && intakeData) {
    return (
      <div className="mx-auto max-w-lg">
        <CrisisWarRoom
          plan={currentPlan}
          planId={currentPlanId}
          taskName={intakeData.taskName}
          deadline={intakeData.deadline}
          onComplete={() => setPhase("done")}
        />
      </div>
    );
  }

  if (phase === "done" && intakeData) {
    return (
      <div className="mx-auto max-w-lg">
        <CrisisDone taskName={intakeData.taskName} />
      </div>
    );
  }

  return null;
}
