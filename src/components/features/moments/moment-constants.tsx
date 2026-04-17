import {
  Battery,
  BatteryLow,
  Zap,
  Target,
  CircleStop,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import type { MomentType } from "@/types";

export interface MomentCopy {
  /** Display label on the chip and in sheet headers. */
  label: string;
  /** Past-tense toast label — "Energy high logged". */
  toastLabel: string;
  /** Description shown in the detail sheet. */
  detailHint: string;
  icon: LucideIcon;
  /**
   * Tailwind class for chip-tinted border/background. Every chip still
   * carries an icon AND text label — color is never the sole signal.
   */
  tintClassName: string;
}

export const MOMENT_TYPES: MomentType[] = [
  "energy_high",
  "energy_low",
  "energy_crash",
  "focus_start",
  "focus_end",
  "tough_moment",
];

export const MOMENT_COPY: Record<MomentType, MomentCopy> = {
  energy_high: {
    label: "Energy high",
    toastLabel: "Energy high logged",
    detailHint: "You're riding a wave. Capture the what.",
    icon: Battery,
    tintClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  energy_low: {
    label: "Energy low",
    toastLabel: "Energy low logged",
    detailHint: "Running on fumes. Intensity helps spot patterns later.",
    icon: BatteryLow,
    tintClassName:
      "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  energy_crash: {
    label: "Crash",
    toastLabel: "Energy crash logged",
    detailHint: "A crash is different from low. Mark when it hit.",
    icon: Zap,
    tintClassName:
      "border-amber-600/50 bg-amber-600/15 text-amber-800 dark:text-amber-200",
  },
  focus_start: {
    label: "Focus start",
    toastLabel: "Focus start logged",
    detailHint: "What are you focusing on? (optional)",
    icon: Target,
    tintClassName:
      "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
  focus_end: {
    label: "Focus end",
    toastLabel: "Focus end logged",
    detailHint: "Wrapping up a focus block. Nice.",
    icon: CircleStop,
    tintClassName:
      "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  },
  tough_moment: {
    label: "Tough moment",
    toastLabel: "Tough moment logged",
    detailHint:
      "Whatever this is, it counts. Intensity helps crisis detection see it.",
    icon: LifeBuoy,
    tintClassName:
      "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};
