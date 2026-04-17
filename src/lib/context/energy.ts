import type { EnergyLevel, MomentType } from "@/types";
import { getHourInTimezone } from "@/lib/timezone";
import { getRecentMoment } from "@/lib/db/queries";

export type TimeBlock = "morning" | "afternoon" | "evening" | "night";

/**
 * Determine the current time-of-day block from user's timezone.
 * No longer tied to energy — kept as a general greeting / time context helper.
 */
export function getTimeOfDayBlock(timezone: string): TimeBlock {
  const hour = getHourInTimezone(new Date(), timezone);

  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Map a Moment type to an EnergyLevel, or null if the type isn't an energy
 * signal (focus_start/focus_end/tough_moment convey state, not energy).
 */
export function deriveEnergyFromMoment(type: MomentType): EnergyLevel | null {
  switch (type) {
    case "energy_high":
      return "high";
    case "energy_low":
    case "energy_crash":
      return "low";
    default:
      return null;
  }
}

/**
 * Current energy signal, sourced from the user's most recent Moment.
 *
 * Returns null when there is no recent Moment (or the most recent Moment
 * isn't an energy-typed one). Callers should treat null as "unknown" and
 * prompt the user (via the Moments chip-bar) if they need a signal.
 *
 * @param override Optional caller-supplied energy (e.g., user-reported inline).
 */
export async function getCurrentEnergy(
  userId: string,
  _timezone: string,
  override?: EnergyLevel
): Promise<EnergyLevel | null> {
  if (override) return override;

  const moment = await getRecentMoment(userId, 120);
  if (!moment) return null;

  return deriveEnergyFromMoment(moment.type as MomentType);
}
