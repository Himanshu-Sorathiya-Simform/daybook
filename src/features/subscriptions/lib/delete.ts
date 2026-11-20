import type { SubscriptionItem } from "./types";

/** The Delete confirmation's own words (BR-F05-44). */
export const DELETE_TEXT = {
	title: (name: string) => `Delete ${name}?`,
	keep: (name: string) => `Keep ${name}`,
	delete: (name: string) => `Delete ${name}`,
	forgets:
		"Daybook stops adding charges and forgets the schedule and skipped dates.",
	keepEnded: "To keep it under Ended, ",
	cancelInstead: "cancel it instead",
	failed: "The Subscription could not be deleted. Check your connection and try again.",
} as const;

/** What happens to its charges (BR-F05-44): "Its 2 charges stay in Transactions as ordinary
 * expenses.", with the one-charge and no-charge forms. */
export function chargesLine(count: number): string {
	if (count === 0) {
		return "It has no charges yet, so nothing changes in Transactions.";
	}
	return count === 1 ?
			"Its 1 charge stays in Transactions as an ordinary expense."
		:	`Its ${count} charges stay in Transactions as ordinary expenses.`;
}

/** Whether the confirmation offers to cancel instead: for a Subscription that is neither upcoming
 * nor ended (BR-F05-44). */
export function offersCancel(item: Pick<SubscriptionItem, "status">): boolean {
	return item.status !== "upcoming" && item.status !== "ended";
}
