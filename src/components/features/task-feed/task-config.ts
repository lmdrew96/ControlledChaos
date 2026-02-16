import type {
  TaskPriority,
  EnergyLevel,
  TaskCategory,
  LocationTag,
  TaskStatus,
} from "@/types";

export const priorityConfig = {
  urgent: {
    label: "Urgent",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  important: {
    label: "Important",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  },
  normal: {
    label: "Normal",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  someday: {
    label: "Someday",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
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

export const locationOptions: { value: LocationTag; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "campus", label: "Campus" },
  { value: "work", label: "Work" },
];

export const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "snoozed", label: "Snoozed" },
  { value: "cancelled", label: "Cancelled" },
];
