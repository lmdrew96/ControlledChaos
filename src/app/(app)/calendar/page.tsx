import { WeekView } from "@/components/features/calendar/week-view";

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground">
          Canvas, Google, and AI-scheduled blocks — all in one place.
        </p>
      </div>

      <WeekView />
    </div>
  );
}
