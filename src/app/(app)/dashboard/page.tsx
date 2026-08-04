"use client";

import { useState, useEffect } from "react";
import { TaskList } from "@/components/features/task-feed/task-list";
import { DoThisNext } from "@/components/features/recommendation/do-this-next";
import { DailyMomentum } from "@/components/features/dashboard/daily-momentum";
import { ScheduleMyDay } from "@/components/features/dashboard/schedule-my-day";
import { TimeAnchor } from "@/components/features/dashboard/time-anchor";
import { Greeting } from "@/components/features/dashboard/greeting";
import { MicrotasksZone } from "@/components/features/microtasks/microtasks-zone";
import { MomentumPanel } from "@/components/features/momentum/momentum-panel";

export default function DashboardPage() {
  const [momentumExpanded, setMomentumExpanded] = useState(false);

  // Old /momentum bookmarks/links redirect here with this hash — auto-expand
  // and scroll to it instead of leaving the visitor at a collapsed header.
  useEffect(() => {
    if (window.location.hash !== "#momentum-panel") return;
    setMomentumExpanded(true);
    document
      .getElementById("momentum-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="space-y-6">
      {/* Greeting + Time anchor */}
      <div className="space-y-3">
        <Greeting />
        <TimeAnchor />
      </div>

      {/* Hero: Task Recommendation — only loud surface */}
      <DoThisNext />

      {/* Today strip — momentum bars on the left, plan-my-day pill on the right */}
      <div className="flex flex-wrap items-center gap-3">
        <DailyMomentum
          onOpenDetails={() => {
            setMomentumExpanded(true);
            document
              .getElementById("momentum-panel")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        <div className="ml-auto">
          <ScheduleMyDay />
        </div>
      </div>

      {/* Momentum details — collapsed by default, opened via the strip above */}
      <MomentumPanel
        expanded={momentumExpanded}
        onExpandedChange={setMomentumExpanded}
      />

      {/* Microtasks chip zone — small daily prompts, hidden in Crisis Mode */}
      <MicrotasksZone />

      {/* Task feed — collapsed by default; click header to expand */}
      <TaskList collapsible />
    </div>
  );
}
