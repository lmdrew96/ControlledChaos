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
import { useIsMounted } from "@/hooks/use-is-mounted";

export default function DashboardPage() {
  // Old /momentum bookmarks/links redirect here with this hash — start expanded
  // instead of leaving the visitor at a collapsed header. Gated on hydration
  // because the server can't see the fragment.
  const mounted = useIsMounted();
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const momentumExpanded =
    expandedOverride ?? (mounted && window.location.hash === "#momentum-panel");
  const setMomentumExpanded = setExpandedOverride;
  // Bumped after a plan is committed; used as a key so TimeAnchor and the task
  // feed re-read rather than showing yesterday's picture of today.
  const [planVersion, setPlanVersion] = useState(0);

  useEffect(() => {
    if (window.location.hash !== "#momentum-panel") return;
    document
      .getElementById("momentum-panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="space-y-6">
      {/* Greeting + Time anchor */}
      <div className="space-y-3">
        <Greeting />
        <TimeAnchor key={`anchor-${planVersion}`} />
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
          {/* Remount the dependent surfaces so a fresh plan shows immediately. */}
          <ScheduleMyDay onPlanCommitted={() => setPlanVersion((v) => v + 1)} />
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
      <TaskList key={`tasks-${planVersion}`} collapsible />
    </div>
  );
}
