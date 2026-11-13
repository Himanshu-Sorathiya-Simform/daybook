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

/** "A Shopping Budget already exists. We opened it so you can change it." (flow 7.1). */
export function budgetExistsMessage(categoryLabel: string): string {
	return `A ${categoryLabel} Budget already exists. We opened it so you can change it.`;
}
