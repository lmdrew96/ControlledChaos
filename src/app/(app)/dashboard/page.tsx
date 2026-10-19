"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TaskList } from "@/components/features/task-feed/task-list";
import { DoThisNext, type GapRequest } from "@/components/features/recommendation/do-this-next";
import { DailyMomentum } from "@/components/features/dashboard/daily-momentum";
import { ScheduleMyDay } from "@/components/features/dashboard/schedule-my-day";
import { TimeAnchor } from "@/components/features/dashboard/time-anchor";
import { Greeting } from "@/components/features/dashboard/greeting";
import { TodayCard } from "@/components/features/dashboard/today-card";
import { MicrotasksZone } from "@/components/features/microtasks/microtasks-zone";
import { GoalStrip } from "@/components/features/goals/goal-strip";
import { ReferenceCards } from "@/components/features/reference-cards/reference-cards";

export default function DashboardPage() {
  const router = useRouter();
  // Bumped after a plan is committed; used as a key so TimeAnchor and the task
  // feed re-read rather than showing yesterday's picture of today.
  const [planVersion, setPlanVersion] = useState(0);
  // Bumped when the Today card completes a task, so the task feed's counts
  // catch up. Separate from planVersion so it doesn't reset the anchor.
  const [tasksVersion, setTasksVersion] = useState(0);
  // Bumped when the task feed or Do This Next changes a task. Passed as a
  // refresh prop, not a key, so the Today card and timeline re-read in place
  // without flashing their loading state.
  const [todayVersion, setTodayVersion] = useState(0);
  const refreshToday = () => setTodayVersion((v) => v + 1);

  // Changes made elsewhere (calendar in another tab, the MCP tools, a push
  // action) also show up when you come back to the tab. At most once a
  // minute, so flicking between tabs doesn't refetch every time.
  useEffect(() => {
    let lastRefresh = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      setTodayVersion((v) => v + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  // A free gap tapped on the day timeline: ask "what should I do?" for it.
  const [gapRequest, setGapRequest] = useState<GapRequest | null>(null);
  const askForGap = (minutes: number) => {
    setGapRequest((prev) => ({ minutes, nonce: (prev?.nonce ?? 0) + 1 }));
    document
      .getElementById("do-this-next")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Momentum used to live here as an accordion; old links still point at it.
  useEffect(() => {
    if (window.location.hash === "#momentum-panel") router.replace("/momentum");
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Greeting + Time anchor */}
      <div className="space-y-3">
        <Greeting />
        <TimeAnchor
          key={`anchor-${planVersion}`}
          onGapSelect={askForGap}
          refreshKey={todayVersion}
        />
      </div>

      {/* Today — overdue, due today, planned today. Open by default. */}
      <TodayCard
        key={`today-${planVersion}`}
        refreshKey={todayVersion}
        onTaskChanged={() => setTasksVersion((v) => v + 1)}
      />

      {/* Hero: Task Recommendation — only loud surface */}
      <div id="do-this-next" className="scroll-mt-4">
        <DoThisNext
          gapRequest={gapRequest}
          onTaskChanged={() => {
            refreshToday();
            setTasksVersion((v) => v + 1);
          }}
        />
      </div>

      {/* Today strip — momentum bars on the left, plan-my-day pill on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <DailyMomentum />
        <div className="ml-auto">
          {/* Remount the dependent surfaces so a fresh plan shows immediately. */}
          <ScheduleMyDay onPlanCommitted={() => setPlanVersion((v) => v + 1)} />
        </div>
      </div>

      {/* Microtasks chip zone — small daily prompts, hidden in Crisis Mode */}
      <MicrotasksZone />

      {/* Pinned playbooks and checklists — quiet, hidden in Crisis Mode */}
      <ReferenceCards />

      {/* Top goals and their next steps — quiet, hidden in Crisis Mode */}
      <GoalStrip />

      {/* Task feed — collapsed by default; click header to expand */}
      <TaskList
        key={`tasks-${planVersion}-${tasksVersion}`}
        collapsible
        onTaskChanged={refreshToday}
      />
    </div>
  );
}
