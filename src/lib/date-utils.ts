/**
 * Backward-compatibility shim — all timezone logic now lives in ./timezone.ts.
 * Existing imports from "@/lib/date-utils" continue to work.
 */
export { startOfDayInTimezone as startOfDayInTz } from "./timezone";
export { todayInTimezone as todayInTz } from "./timezone";
export { startOfWeekInTimezone as startOfWeekInTz } from "./timezone";
