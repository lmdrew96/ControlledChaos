"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Brain, ListTodo, Plus, ArrowUpDown, Zap, Tag, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskCard } from "./task-card";
import { TaskDetailModal } from "./task-detail-modal";
import { CreateTaskModal } from "./create-task-modal";
import Link from "next/link";
import type { Task, CalendarColors } from "@/types";
import { priorityOptions, energyOptions, categoryOptions } from "./task-config";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type FilterStatus = "active" | "completed" | "all";
type SortBy = "none" | "priority" | "deadline" | "manual";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  important: 1,
  normal: 2,
  someday: 3,
};

function applySort(tasks: Task[], sortBy: SortBy): Task[] {
  if (sortBy === "none" || sortBy === "manual") return tasks;
  return [...tasks].sort((a, b) => {
    if (sortBy === "priority") {
      return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    }
    // deadline: nulls go last
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  });
}

function SortableTaskCard({
  task,
  calendarColors,
  onUpdate,
  onClick,
  isDragMode,
}: {
  task: Task;
  calendarColors?: CalendarColors | null;
  onUpdate: () => void;
  onClick: () => void;
  isDragMode: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-0">
      {isDragMode && (
        <button
          className="flex items-center px-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <TaskCard
          task={task}
          calendarColors={calendarColors}
          onUpdate={onUpdate}
          onClick={onClick}
        />
      </div>
    </div>
  );
}

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("active");
  const [sortBy, setSortBy] = useState<SortBy>("none");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterEnergy, setFilterEnergy] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [calendarColors, setCalendarColors] = useState<CalendarColors | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.calendarColors) setCalendarColors(data.calendarColors as CalendarColors); })
      .catch(() => {});
  }, []);

  const filteredTasks = applySort(
    tasks.filter((task) => {
      if (filter === "active" && task.status === "completed") return false;
      if (filter === "completed" && task.status !== "completed") return false;
      if (filterPriority !== "all" && task.priority !== filterPriority) return false;
      if (filterEnergy !== "all" && task.energyLevel !== filterEnergy) return false;
      if (filterCategory !== "all" && task.category !== filterCategory) return false;
      return true;
    }),
    sortBy
  );

  const activeTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const isDragMode = sortBy === "manual" && filter === "active" &&
    filterPriority === "all" && filterEnergy === "all" && filterCategory === "all";

  const hasActiveFilters =
    sortBy !== "none" ||
    filterPriority !== "all" ||
    filterEnergy !== "all" ||
    filterCategory !== "all";

  function clearFilters() {
    setSortBy("none");
    setFilterPriority("all");
    setFilterEnergy("all");
    setFilterCategory("all");
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredTasks.findIndex((t) => t.id === active.id);
    const newIndex = filteredTasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic reorder
    const reordered = [...filteredTasks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Update local state immediately
    const reorderedIds = reordered.map((t) => t.id);
    const updatedTasks = tasks.map((t) => {
      const idx = reorderedIds.indexOf(t.id);
      return idx !== -1 ? { ...t, sortOrder: idx } : t;
    });
    updatedTasks.sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity));
    setTasks(updatedTasks);

    // Persist to server
    try {
      await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reorderedIds }),
      });
    } catch {
      // Revert on failure
      fetchTasks();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
          <ListTodo className="h-10 w-10 text-muted-foreground/50" />
          <div className="text-center">
            <p className="font-medium">No tasks yet</p>
            <p className="text-sm text-muted-foreground">
              Start with a brain dump or add a task directly
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/dump">
                <Brain className="mr-2 h-4 w-4" />
                Brain Dump
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Task
            </Button>
          </div>
        </div>
        <CreateTaskModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            fetchTasks();
            // Refetch after a short delay to pick up the AI-generated note
            setTimeout(fetchTasks, 3000);
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""}
      </p>

      {/* Toolbar */}
      <div className="space-y-2">
        {/* Status tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(
            [
              { key: "active", label: `Active (${activeTasks.length})` },
              { key: "completed", label: `Done (${completedTasks.length})` },
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

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {/* Sort */}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="h-8 w-full gap-1 px-2 text-xs sm:w-auto">
              <ArrowUpDown className="h-3 w-3 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sort</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="deadline">Deadline</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>

          {/* Priority filter */}
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-full gap-1 px-2 text-xs sm:w-auto">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Priority</SelectItem>
              {priorityOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Energy filter */}
          <Select value={filterEnergy} onValueChange={setFilterEnergy}>
            <SelectTrigger className="h-8 w-full gap-1 px-2 text-xs sm:w-auto">
              <Zap className="h-3 w-3 shrink-0" />
              <SelectValue placeholder="Energy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Energy</SelectItem>
              {energyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Category filter */}
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 w-full gap-1 px-2 text-xs sm:w-auto">
              <Tag className="h-3 w-3 shrink-0" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Category</SelectItem>
              {categoryOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Clear active filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="col-span-2 justify-self-start text-xs text-muted-foreground underline transition-colors hover:text-foreground sm:col-auto"
            >
              Clear
            </button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            className="col-span-2 w-full sm:col-auto sm:ml-auto sm:w-auto"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Task
          </Button>
        </div>

        {isDragMode && (
          <p className="text-xs text-muted-foreground">
            Drag tasks to reorder. Order is saved automatically.
          </p>
        )}
      </div>

      {/* Task list */}
      {isDragMode ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  task={task}
                  calendarColors={calendarColors}
                  onUpdate={fetchTasks}
                  onClick={() => setSelectedTaskId(task.id)}
                  isDragMode={true}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              calendarColors={calendarColors}
              onUpdate={fetchTasks}
              onClick={() => setSelectedTaskId(task.id)}
            />
          ))}

          {filteredTasks.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {filter === "completed"
                ? "No completed tasks yet. You got this!"
                : hasActiveFilters
                  ? "No tasks match your current filters."
                  : "All caught up!"}
            </p>
          )}
        </div>
      )}

      {/* Empty state for drag mode */}
      {isDragMode && filteredTasks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No active tasks to reorder.
        </p>
      )}

      {/* Task detail modal */}
      <TaskDetailModal
        task={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onUpdate={fetchTasks}
      />

      {/* Create task modal */}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={fetchTasks}
      />
    </div>
  );
}
