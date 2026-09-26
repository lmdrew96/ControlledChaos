"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Target, Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { GoalCard } from "./goal-card";
import { CreateGoalModal } from "./create-goal-modal";
import { FinishGoalDialog } from "./finish-goal-dialog";
import { openStepCount } from "./goal-meta";
import { LoadErrorStrip } from "@/components/ui/load-error-strip";
import type { Goal } from "@/types";

type FilterStatus = "active" | "completed" | "paused" | "all";

function SortableGoal({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }}
      className="flex items-stretch"
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="flex items-center px-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function GoalList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<FilterStatus>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [finishGoal, setFinishGoal] = useState<Goal | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Every goal in one fetch, filtered here: switching tabs is instant, and the
  // tabs can show counts so finished or paused goals are never out of reach.
  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch("/api/goals");
      if (!res.ok) throw new Error(`GET /api/goals ${res.status}`);
      const data = await res.json();
      setGoals(data.goals);
      setLoadError(false);
    } catch (error) {
      console.error("Failed to fetch goals:", error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError && goals.length === 0) {
    return <LoadErrorStrip message="Couldn't load your goals." onRetry={fetchGoals} />;
  }

  const countFor = (key: FilterStatus): number =>
    key === "all" ? goals.length : goals.filter((g) => g.status === key).length;
  const visibleGoals = filter === "all" ? goals : goals.filter((g) => g.status === filter);
  // Order is about what matters most right now, so it's arranged among active goals.
  const canReorder = filter === "active" && visibleGoals.length > 1;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleGoals.findIndex((g) => g.id === active.id);
    const newIndex = visibleGoals.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Active goals take the top of the order; everything else keeps its place after them.
    const reorderedActive = arrayMove(visibleGoals, oldIndex, newIndex);
    const rest = goals.filter((g) => g.status !== "active");
    const next = [...reorderedActive, ...rest].map((g, i) => ({ ...g, sortOrder: i }));
    setGoals(next);

    try {
      const res = await fetch("/api/goals/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: next.map((g) => g.id) }),
      });
      if (!res.ok) throw new Error(`POST /api/goals/reorder ${res.status}`);
    } catch (error) {
      console.error("Goal reorder failed:", error);
      toast.error("Couldn't save that order. Try again.");
      void fetchGoals();
    }
  };

  const renderCard = (goal: Goal) => (
    <GoalCard
      goal={goal}
      onUpdate={fetchGoals}
      onEdit={(g) => setEditGoal(g)}
      onFinish={(g) => setFinishGoal(g)}
    />
  );

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
              {countFor(key) > 0 && (
                <span className="ml-1 tabular-nums opacity-60">{countFor(key)}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {canReorder ? "Drag to put what matters most on top — the top three show on your dashboard." : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="shrink-0"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Goal
          </Button>
        </div>
      </div>

      {/* Goal list */}
      {canReorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleGoals.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {visibleGoals.map((goal) => (
                <SortableGoal key={goal.id} id={goal.id}>
                  {renderCard(goal)}
                </SortableGoal>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {visibleGoals.map((goal) => (
            <div key={goal.id}>{renderCard(goal)}</div>
          ))}
        </div>
      )}

      {visibleGoals.length === 0 &&
        (goals.length === 0 ? (
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
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filter === "completed"
              ? "No completed goals yet. Keep going!"
              : filter === "paused"
                ? "No paused goals."
                : "No active goals right now."}
          </p>
        ))}

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

      <FinishGoalDialog
        goal={finishGoal}
        openSteps={finishGoal ? openStepCount(finishGoal) : 0}
        onClose={() => setFinishGoal(null)}
        onFinished={fetchGoals}
      />
    </div>
  );
}
