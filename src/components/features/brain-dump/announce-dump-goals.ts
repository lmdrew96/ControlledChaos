import { toast } from "sonner";

export interface DumpGoal {
  id: string;
  title: string;
}

/**
 * A dump that proposed a new goal says so, with a way to open it — the dump
 * itself lands on its tasks, so the goal would otherwise go unnoticed.
 */
export function announceDumpGoals(
  goals: DumpGoal[] | undefined,
  navigate: (href: string) => void
): void {
  for (const goal of goals ?? []) {
    toast(`New goal: “${goal.title}”`, {
      description: "Made from this dump. Open it to add or adjust steps.",
      duration: 10000,
      action: { label: "Open goal", onClick: () => navigate(`/goals/${goal.id}`) },
    });
  }
}
