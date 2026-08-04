import { TaskList } from "@/components/features/task-feed/task-list";
import { PageHeader } from "@/components/ui/page-header";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Everything your brain dumped, structured and ready."
      />

      <TaskList />
    </div>
  );
}
