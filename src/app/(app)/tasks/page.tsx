import { TaskList } from "@/components/features/task-feed/task-list";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground">
          Everything your brain dumped, structured and ready.
        </p>
      </div>

      <TaskList />
    </div>
  );
}
