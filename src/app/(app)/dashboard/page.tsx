import { TaskList } from "@/components/features/task-feed/task-list";
import { DoThisNext } from "@/components/features/recommendation/do-this-next";
import { DailyMomentum } from "@/components/features/dashboard/daily-momentum";
import { ScheduleMyDay } from "@/components/features/dashboard/schedule-my-day";
import { TimeAnchor } from "@/components/features/dashboard/time-anchor";
import { Greeting } from "@/components/features/dashboard/greeting";
import { MicrotasksZone } from "@/components/features/microtasks/microtasks-zone";

export default function DashboardPage() {
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
        <DailyMomentum />
        <div className="ml-auto">
          <ScheduleMyDay />
        </div>
      </div>

      {/* Microtasks chip zone — small daily prompts, hidden in Crisis Mode */}
      <MicrotasksZone />

      {/* Task feed — collapsed by default; click header to expand */}
      <TaskList collapsible />
    </div>
  );
}
