/** F03 section 8's messages that the page writes itself, rather than reading from the API's
 * error envelope. The server's own messages arrive in the envelope's `fields` and `message`. */
export const TRANSACTIONS_TEXT = {
	saveFailed: "Your change wasn't saved. Try again.",
	deletedElsewhere: "This Transaction was deleted on another device.",
	deleteFailed: "Couldn't delete. Check your connection and try again.",
	notFound: "We couldn't find that Transaction.",
	viewChanged: "This view changed on another device. Try again.",
	viewDeleted: "This view was deleted on another device.",
	invalidLink: "Some filters in this link weren't valid and were removed.",
} as const;

/** "Choose a date from 6 Oct to 16 Oct.": an edit's own entry window (D-499), with both ends in
 * F02's short date format. */
export function editWindowMessage(firstOn: string, lastOn: string): string {
	return `Choose a date from ${firstOn} to ${lastOn}.`;
}
