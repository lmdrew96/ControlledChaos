"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Brain, ListTodo, Plus, ArrowUpDown, Zap, Tag } from "lucide-react";
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
import type { Task } from "@/types";
import { priorityOptions, energyOptions, categoryOptions } from "./task-config";

type FilterStatus = "active" | "completed" | "all";
type SortBy = "none" | "priority" | "deadline";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  important: 1,
  normal: 2,
  someday: 3,
};

function applySort(tasks: Task[], sortBy: SortBy): Task[] {
  if (sortBy === "none") return tasks;
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
          onCreated={fetchTasks}
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
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
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
