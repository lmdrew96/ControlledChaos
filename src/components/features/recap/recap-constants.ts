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
    // Soft Green #97D181
    tintClassName:
      "text-[#4c7a3a] bg-[#97D181]/15 border-[#97D181]/40 dark:text-[#b8e2a0]",
    href: (entry) => `/tasks?taskId=${entry.id}`,
  },
  microtask: {
    label: "Microtasks",
    icon: CircleCheck,
    // Shares the task green: small wins are still wins.
    tintClassName:
      "text-[#4c7a3a] bg-[#97D181]/10 border-[#97D181]/30 dark:text-[#b8e2a0]",
    // They live on the dashboard.
    href: () => "/dashboard",
  },
  event: {
    label: "Events",
    icon: Calendar,
    // Sage Teal #8CBDB9
    tintClassName:
      "text-[#3e6a66] bg-[#8CBDB9]/15 border-[#8CBDB9]/40 dark:text-[#abd2ce]",
    href: (entry, timezone) =>
      `/calendar?date=${toDateKeyInTimezone(new Date(entry.at), timezone)}`,
  },
  dump: {
    label: "Dumps",
    icon: Brain,
    // Mauve Purple #88739E
    tintClassName:
      "text-[#5b4d70] bg-[#88739E]/15 border-[#88739E]/40 dark:text-[#b29bce]",
    href: (entry) => `/dump?dumpId=${entry.id}`,
  },
  journal: {
    label: "Journal",
    icon: BookOpen,
    // Mauve Purple #88739E — shares color with dumps, differentiated by icon + label
    tintClassName:
      "text-[#5b4d70] bg-[#88739E]/15 border-[#88739E]/60 dark:text-[#b29bce]",
    href: (entry) => `/dump?category=junk_journal&dumpId=${entry.id}`,
  },
  rescue: {
    label: "Rescue",
    icon: Siren,
    // Amber: same family as moments, since both are about how the day felt.
    tintClassName:
      "text-[#8a6422] bg-[#DFA649]/10 border-[#DFA649]/30 dark:text-[#e9c175]",
    href: () => "/crisis",
  },
  moment: {
    label: "Moments",
    icon: Sparkles,
    // Amber #DFA649
    tintClassName:
      "text-[#8a6422] bg-[#DFA649]/15 border-[#DFA649]/40 dark:text-[#e9c175]",
    // Moments have no source page in v1 — row is non-interactive
    href: null,
  },
};
