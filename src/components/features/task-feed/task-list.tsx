"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Brain, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskCard } from "./task-card";
import { TaskDetailModal } from "./task-detail-modal";
import Link from "next/link";
import type { Task } from "@/types";

type FilterStatus = "active" | "completed" | "all";

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("active");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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

  const filteredTasks = tasks.filter((task) => {
    if (filter === "active") return task.status !== "completed";
    if (filter === "completed") return task.status === "completed";
    return true;
  });

  const activeTasks = tasks.filter((t) => t.status !== "completed");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
        <ListTodo className="h-10 w-10 text-muted-foreground/50" />
        <div className="text-center">
          <p className="font-medium">No tasks yet</p>
          <p className="text-sm text-muted-foreground">
            Start with a brain dump to get your tasks flowing
          </p>
        </div>
        <Button asChild>
          <Link href="/dump">
            <Brain className="mr-2 h-4 w-4" />
            Brain Dump
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
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
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
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
    </div>
  );
}
