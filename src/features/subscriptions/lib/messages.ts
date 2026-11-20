import { formatTime } from "@/lib/date-format";
import { SUBSCRIPTION_MESSAGES } from "@/lib/subscriptions/messages";

/** F05 section 8's messages that the page writes itself for a refused write, rather than
 * reading from the API's error envelope. The server's own messages arrive in the envelope's
 * `fields` and `message`. */
export const SUBSCRIPTIONS_TEXT = {
	saveFailed:
		"The Subscription could not be saved. Check your connection and try again. Your changes are still here.",
	deleteFailed:
		"The Subscription could not be deleted. Check your connection and try again.",
	noticeFailed:
		"The Subscription could not be saved. Check your connection and try again.",
	deletedElsewhere: SUBSCRIPTION_MESSAGES.notFound,
	cannotUndo: SUBSCRIPTION_MESSAGES.cannotUndo,
} as const;

/** The page's own words (BR-F05-21, section 6). */
export const PAGE_TEXT = {
	title: "Subscriptions",
	viewLabel: "Show Subscriptions as",
	viewNames: { list: "List", calendar: "Calendar", table: "Table" },
	loading: "Loading Subscriptions",
	loadFailed: "Subscriptions could not be loaded.",
	loadFailedBody:
		"Check your connection, then try again. Your Subscriptions are safe.",
	retry: "Retry",
	emptyTitle: "No Subscriptions yet.",
	emptyBody: "Add rent, streaming, insurance or any bill that repeats.",
	add: "Add a Subscription",
} as const;

/** The list's own words (BR-F05-22, BR-F05-37). */
export const LIST_TEXT = {
	label: "Subscriptions",
	newestFirst: "Newest first",
	resume: "Resume",
	actionsFor: (name: string) => `Actions for ${name}`,
} as const;

/** "as of 2:05 pm" beside the title while offline, once the list has loaded (section 10);
 * `null` online, or when nothing has loaded. `updatedAt` is the load's time in milliseconds. */
export function asOfText(
	online: boolean,
	updatedAt: number,
	formats: { dateLocale: string; timezone: string },
): string | null {
	if (online || updatedAt <= 0) return null;
	return `as of ${formatTime(new Date(updatedAt), formats)}`;
}
