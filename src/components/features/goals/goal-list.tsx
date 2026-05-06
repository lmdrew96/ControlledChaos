"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Target, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoalCard } from "./goal-card";
import { CreateGoalModal } from "./create-goal-modal";
import type { Goal } from "@/types";

type FilterStatus = "active" | "completed" | "paused" | "all";

export function GoalList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const url = filter === "all" ? "/api/goals" : `/api/goals?status=${filter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals);
      }
    } catch (error) {
      console.error("Failed to fetch goals:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setIsLoading(true);
    fetchGoals();
  }, [fetchGoals]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (goals.length === 0 && filter === "active") {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
          <Target className="h-10 w-10 text-muted-foreground/50" />
          <div className="text-center">
            <p className="font-medium">No goals yet</p>
            <p className="text-sm text-muted-foreground">
              Goals help you see the bigger picture behind your tasks.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create a Goal
          </Button>
        </div>
        <CreateGoalModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSaved={fetchGoals}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: "active", label: "Active" },
              { key: "completed", label: "Completed" },
              { key: "paused", label: "Paused" },
              { key: "all", label: "All" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                filter === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Goal
          </Button>
        </div>
      </div>

      {/* Goal list */}
      <div className="space-y-2">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onUpdate={fetchGoals}
            onEdit={(g) => setEditGoal(g)}
          />
        ))}

        {goals.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filter === "completed"
              ? "No completed goals yet. Keep going!"
              : filter === "paused"
                ? "No paused goals."
                : "No goals found."}
          </p>
        )}
      </div>

      {/* Create/Edit modal */}
      <CreateGoalModal
        open={createOpen || !!editGoal}
        onClose={() => {
          setCreateOpen(false);
          setEditGoal(null);
        }}
        onSaved={fetchGoals}
        editGoal={editGoal}
      />
    </div>
  );
}
