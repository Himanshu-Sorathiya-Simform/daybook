import type { WeekStart } from "@/lib/geo";

/** React Aria's name for each profile week start, for a calendar's `firstDayOfWeek` (F02's
 * `weekStart`, D-76). */
export const ARIA_FIRST_DAY = {
	monday: "mon",
	sunday: "sun",
	saturday: "sat",
} as const satisfies Record<WeekStart, string>;
