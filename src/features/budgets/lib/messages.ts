import { formatTime } from "@/lib/date-format";

/** F04 section 8's messages that the page writes itself for a refused write, rather than
 * reading from the API's error envelope. The server's own messages arrive in the envelope's
 * `fields` and `message`. */
export const BUDGETS_TEXT = {
	saveFailed:
		"The Budget could not be saved. Check your connection and try again. Your changes are still here.",
	deleteFailed:
		"The Budget could not be deleted. Check your connection and try again.",
	noticeFailed:
		"The Budget could not be saved. Check your connection and try again.",
	deletedElsewhere: "This Budget was deleted on another device.",
} as const;

/** "as of 2:05 pm" beside the title while offline, once a month has loaded (section 10); `null`
 * online, or when nothing has loaded. `updatedAt` is the load's time in milliseconds. */
export function asOfText(
	online: boolean,
	updatedAt: number,
	formats: { dateLocale: string; timezone: string },
): string | null {
	if (online || updatedAt <= 0) return null;
	return `as of ${formatTime(new Date(updatedAt), formats)}`;
}

/** "A Shopping Budget already exists. We opened it so you can change it." (flow 7.1), with
 * "An" before a vowel: "An Entertainment Budget …". */
export function budgetExistsMessage(categoryLabel: string): string {
	const article = /^[AEIOU]/i.test(categoryLabel) ? "An" : "A";
	return `${article} ${categoryLabel} Budget already exists. We opened it so you can change it.`;
}

/** The page's own words (BR-F04-14, section 6, section 8). */
export const PAGE_TEXT = {
	title: "Budgets",
	add: "Add a Budget",
	viewLabel: "Show Budgets as",
	list: "List",
	table: "Table",
	gridLabel: "Choose a month",
	gridCaption: "Figures: overall use of the month's limits",
	thisMonth: "This month",
	invalidLink: "Some filters in this link weren't valid and were removed.",
	dismiss: "Dismiss",
	loadFailed: "Budgets could not be loaded.",
	loadFailedBody: "Check your connection, then try again. Your Budgets are safe.",
	retry: "Retry",
	emptyBody: "Budgets apply from the month you choose.",
	offlineTitle: "You're offline. This month isn't saved on this device.",
} as const;

/** "November 2026 · to date" for the current month, else "October 2026" (BR-F04-14). */
export function monthLabel(monthName: string, isCurrent: boolean): string {
	return isCurrent ? `${monthName} · to date` : monthName;
}

/** "No Budgets for October 2026." (section 6). */
export function emptyTitle(monthName: string): string {
	return `No Budgets for ${monthName}.`;
}

/** "Only November 2026 is kept for offline use." (section 6). */
export function offlineBody(currentMonthName: string): string {
	return `Only ${currentMonthName} is kept for offline use.`;
}

/** "Go to November" (section 6). */
export function offlineAction(currentName: string): string {
	return `Go to ${currentName}`;
}
