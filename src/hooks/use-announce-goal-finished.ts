"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { GoalFinished } from "@/types";

/**
 * After a task completion PATCH: if the server says that was its goal's last
 * open step, offer to go wrap the goal up. Reads a clone, so the caller can
 * still use the response body.
 */
export function useAnnounceGoalFinished(): (res: Response) => Promise<void> {
  const router = useRouter();
  return useCallback(
    async (res: Response) => {
      if (!res.ok) return;
      const data = (await res.clone().json().catch(() => null)) as {
        goalFinished?: GoalFinished | null;
      } | null;
      const goal = data?.goalFinished;
      if (!goal) return;
      toast(`That's every step for “${goal.title}”.`, {
        description: "Want to call the goal done?",
        duration: 10000,
        action: { label: "Open goal", onClick: () => router.push(`/goals/${goal.id}`) },
      });
    },
    [router]
  );
}
