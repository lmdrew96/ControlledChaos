import {
  Battery,
  BatteryLow,
  Zap,
  Target,
  CircleStop,
  LifeBuoy,
  Moon,
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
  // Positioned first so it's the easiest chip to reach during the
  // morning routine, which is when you'd log sleep.
  "sleep_logged",
  "energy_high",
  "energy_low",
  "energy_crash",
  "focus_start",
  "focus_end",
  "tough_moment",
];

export const MOMENT_COPY: Record<MomentType, MomentCopy> = {
  // sleep_logged: lightweight sleep tracking as a Moment.
  //
  // Convention (see ChaosPatch c880919c-...):
  //   intensity = rested-feeling 1-5
  //   note      = hours as free text ("7h", "6h 30m", "restless night")
  //
  // Future migration path: if Patterns needs structured hours, extract to
  // a dedicated `sleep_logs` table. Backfill by parsing `note` from rows
  // where type = 'sleep_logged'. Keep the raw moment rows for audit.
  sleep_logged: {
    label: "Slept",
    toastLabel: "Sleep logged",
    detailHint:
      "Intensity = how rested you feel (1-5). Drop hours in the note: “7h”, “6h 30m”, “restless night”.",
    icon: Moon,
    tintClassName:
      "border-adhd-teal/40 bg-adhd-teal/10 text-adhd-teal dark:border-adhd-lavender/40 dark:bg-adhd-lavender/10 dark:text-adhd-lavender",
  },
  energy_high: {
    label: "Energy high",
    toastLabel: "Energy high logged",
    detailHint: "You're riding a wave. Capture the what.",
    icon: Battery,
    tintClassName:
      "border-warning/40 bg-warning/10 text-warning",
  },
  energy_low: {
    label: "Energy low",
    toastLabel: "Energy low logged",
    detailHint: "Running on fumes. Intensity helps spot patterns later.",
    icon: BatteryLow,
    tintClassName:
      "border-warning/40 bg-warning/10 text-warning",
  },
  energy_crash: {
    label: "Crash",
    toastLabel: "Energy crash logged",
    detailHint: "A crash is different from low. Mark when it hit.",
    icon: Zap,
    tintClassName:
      "border-warning/50 bg-warning/15 text-warning",
  },
  focus_start: {
    label: "Focus start",
    toastLabel: "Focus start logged",
    detailHint: "What are you focusing on? (optional)",
    icon: Target,
    tintClassName:
      "border-adhd-teal/40 bg-adhd-teal/10 text-adhd-teal dark:border-adhd-sage/40 dark:bg-adhd-sage/10 dark:text-adhd-sage",
  },
  focus_end: {
    label: "Focus end",
    toastLabel: "Focus end logged",
    detailHint: "Wrapping up a focus block. Nice.",
    icon: CircleStop,
    tintClassName:
      "border-adhd-teal/40 bg-adhd-teal/10 text-adhd-teal dark:border-adhd-sage/40 dark:bg-adhd-sage/10 dark:text-adhd-sage",
  },
  tough_moment: {
    label: "Tough moment",
    toastLabel: "Tough moment logged",
    detailHint:
      "Whatever this is, it counts. Intensity helps rescue detection see it.",
    icon: LifeBuoy,
    tintClassName:
      "border-destructive/40 bg-destructive/10 text-destructive",
  },
};
