import {
  ListTodo,
  Calendar,
  Brain,
  BookOpen,
  Sparkles,
  CircleCheck,
  Siren,
  type LucideIcon,
} from "lucide-react";
import type { RecapKind, RecapEntry } from "@/types";
import { toDateKeyInTimezone } from "@/lib/timezone";

export interface RecapKindMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind class applied to the entry row's icon gutter + pill. */
  tintClassName: string;
  /** Where tapping this row navigates — the specific item, not just its page. null = non-interactive. */
  href: ((entry: RecapEntry, timezone: string) => string | null) | null;
}

export const RECAP_KINDS: RecapKind[] = [
  "task",
  "microtask",
  "event",
  "dump",
  "journal",
  "moment",
  "rescue",
];

export const RECAP_KIND_META: Record<RecapKind, RecapKindMeta> = {
  task: {
    label: "Tasks",
    icon: ListTodo,
    tintClassName: "text-success bg-success/15 border-success/40",
    href: (entry) => `/tasks?taskId=${entry.id}`,
  },
  microtask: {
    label: "Microtasks",
    icon: CircleCheck,
    // Shares the task color: small wins are still wins.
    tintClassName: "text-success bg-success/10 border-success/30",
    // They live on the dashboard.
    href: () => "/dashboard",
  },
  event: {
    label: "Events",
    icon: Calendar,
    tintClassName:
      "text-adhd-teal bg-adhd-teal/10 border-adhd-teal/30 dark:text-adhd-lavender dark:bg-adhd-lavender/10",
    href: (entry, timezone) =>
      `/calendar?date=${toDateKeyInTimezone(new Date(entry.at), timezone)}`,
  },
  dump: {
    label: "Dumps",
    icon: Brain,
    tintClassName:
      "text-adhd-purple bg-adhd-purple/10 border-adhd-purple/30 dark:text-adhd-lavender dark:bg-adhd-lavender/10",
    href: (entry) => `/dump?dumpId=${entry.id}`,
  },
  journal: {
    label: "Journal",
    icon: BookOpen,
    // Shares color with dumps, differentiated by icon + label
    tintClassName:
      "text-adhd-purple bg-adhd-purple/10 border-adhd-purple/50 dark:text-adhd-lavender dark:bg-adhd-lavender/10",
    href: (entry) => `/dump?category=junk_journal&dumpId=${entry.id}`,
  },
  rescue: {
    label: "Rescue",
    icon: Siren,
    // Same family as moments: both are about how the day felt.
    tintClassName: "text-foreground bg-warning/10 border-warning/30",
    href: () => "/crisis",
  },
  moment: {
    label: "Moments",
    icon: Sparkles,
    tintClassName: "text-foreground bg-warning/15 border-warning/40",
    // Moments have no source page in v1 — row is non-interactive
    href: null,
  },
};
