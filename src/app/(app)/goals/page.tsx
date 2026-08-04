import { GoalList } from "@/components/features/goals/goal-list";
import { PageHeader } from "@/components/ui/page-header";

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Goals"
        description="The bigger picture behind the daily chaos."
      />

      <GoalList />
    </div>
  );
}
