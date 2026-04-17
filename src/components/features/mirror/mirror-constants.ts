import {
  ListTodo,
  Calendar,
  Brain,
  BookOpen,
  Pill,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { MirrorKind, MirrorEntry } from "@/types";

export interface MirrorKindMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind class applied to the entry row's icon gutter + pill. */
  tintClassName: string;
  /** Where tapping this row navigates. null = non-interactive. */
  href: ((entry: MirrorEntry) => string | null) | null;
}

export const MIRROR_KINDS: MirrorKind[] = [
  "task",
  "event",
  "dump",
  "journal",
  "moment",
  "med",
];

export const MIRROR_KIND_META: Record<MirrorKind, MirrorKindMeta> = {
  task: {
    label: "Tasks",
    icon: ListTodo,
    // Soft Green #97D181
    tintClassName:
      "text-[#4c7a3a] bg-[#97D181]/15 border-[#97D181]/40 dark:text-[#b8e2a0]",
    href: () => "/tasks",
  },
  event: {
    label: "Events",
    icon: Calendar,
    // Sage Teal #8CBDB9
    tintClassName:
      "text-[#3e6a66] bg-[#8CBDB9]/15 border-[#8CBDB9]/40 dark:text-[#abd2ce]",
    href: () => "/calendar",
  },
  dump: {
    label: "Dumps",
    icon: Brain,
    // Mauve Purple #88739E
    tintClassName:
      "text-[#5b4d70] bg-[#88739E]/15 border-[#88739E]/40 dark:text-[#b29bce]",
    href: () => "/dump",
  },
  journal: {
    label: "Journal",
    icon: BookOpen,
    // Mauve Purple #88739E — shares color with dumps, differentiated by icon + label
    tintClassName:
      "text-[#5b4d70] bg-[#88739E]/15 border-[#88739E]/60 dark:text-[#b29bce]",
    href: () => "/dump",
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
  med: {
    label: "Meds",
    icon: Pill,
    // Soft Blue #5B8FB9 (new; Olive remains reserved for Patch 3 Health)
    tintClassName:
      "text-[#3a5d7a] bg-[#5B8FB9]/15 border-[#5B8FB9]/40 dark:text-[#92b7d1]",
    href: () => "/settings?tab=medications",
  },
};
