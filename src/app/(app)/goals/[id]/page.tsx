import { GoalDetail } from "@/components/features/goals/goal-detail";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoalDetail goalId={id} />;
}
