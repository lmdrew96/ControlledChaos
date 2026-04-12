import { GoalList } from "@/components/features/goals/goal-list";

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
        <p className="text-muted-foreground">
          The bigger picture behind the daily chaos.
        </p>
      </div>

      <GoalList />
    </div>
  );
}
