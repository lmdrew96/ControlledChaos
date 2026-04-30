import type {
  TaskPriority,
  EnergyLevel,
  TaskCategory,
  TaskStatus,
} from "@/types";

export const priorityConfig = {
  urgent: {
    label: "Urgent",
    className: "bg-adhd-clay/15 text-adhd-clay border-adhd-clay/30",
  },
  important: {
    label: "Important",
    className: "bg-adhd-amber/20 text-adhd-amber border-adhd-amber/40",
  },
  normal: {
    label: "Normal",
    className: "bg-adhd-teal/15 text-adhd-teal border-adhd-teal/30 dark:text-adhd-sage dark:border-adhd-sage/40",
  },
  someday: {
    label: "Someday",
    className: "bg-muted text-muted-foreground border-border",
  },
} as const;

export const energyConfig = {
  low: { label: "Low energy", icon: "⚡" },
  medium: { label: "Medium energy", icon: "⚡⚡" },
  high: { label: "High energy", icon: "⚡⚡⚡" },
} as const;

export const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "important", label: "Important" },
  { value: "normal", label: "Normal" },
  { value: "someday", label: "Someday" },
];

export const energyOptions: { value: EnergyLevel; label: string }[] = [
  { value: "low", label: "Low ⚡" },
  { value: "medium", label: "Medium ⚡⚡" },
  { value: "high", label: "High ⚡⚡⚡" },
];

export const categoryOptions: { value: TaskCategory; label: string }[] = [
  { value: "school", label: "School" },
  { value: "work", label: "Work" },
  { value: "personal", label: "Personal" },
  { value: "errands", label: "Errands" },
  { value: "health", label: "Health" },
];

export const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "snoozed", label: "Snoozed" },
  { value: "cancelled", label: "Cancelled" },
];
