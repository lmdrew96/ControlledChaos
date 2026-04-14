import type { EnergyLevel, EnergyProfile } from "@/types";
import { getHourInTimezone } from "@/lib/timezone";

type TimeBlock = keyof EnergyProfile;

/**
 * Determine the current time-of-day block from user's timezone.
 */
export function getTimeOfDayBlock(timezone: string): TimeBlock {
  const hour = getHourInTimezone(new Date(), timezone);

  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/**
 * Get the user's expected energy level for the current time.
 * If a real-time override is provided, use that instead of the profile.
 */
export function getCurrentEnergy(
  energyProfile: EnergyProfile | null,
  timezone: string,
  override?: EnergyLevel
): EnergyLevel {
  if (override) return override;
  if (!energyProfile) return "medium";

  const block = getTimeOfDayBlock(timezone);
  return energyProfile[block] ?? "medium";
}
