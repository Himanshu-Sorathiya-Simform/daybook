/** F03 section 8's messages that the page writes itself, rather than reading from the API's
 * error envelope. The server's own messages arrive in the envelope's `fields` and `message`. */
export const TRANSACTIONS_TEXT = {
	saveFailed: "Your change wasn't saved. Try again.",
	deletedElsewhere: "This Transaction was deleted on another device.",
	deleteTitle: "Delete this Transaction?",
	deleteBody: "It leaves your list now. You can undo for 5 seconds.",
	deleted: "Transaction deleted.",
	undo: "Undo",
	deleteFailed: "Couldn't delete. Check your connection and try again.",
	notFound: "We couldn't find that Transaction.",
	viewChanged: "This view changed on another device. Try again.",
	viewDeleted: "This view was deleted on another device.",
	invalidLink: "Some filters in this link weren't valid and were removed.",
} as const;

/** F03 section 8's messages for the saved views bar (BR-F03-63 to BR-F03-69). A refusal's own
 * words are `TRANSACTIONS_TEXT.viewChanged` and `viewDeleted`, or the server's. */
export const VIEW_TEXT = {
	saved: "Saved as a new view.",
	updated: "View updated.",
	renamed: "View renamed.",
	deleted: "View deleted.",
	hint: "Change a filter, then save it as a view.",
	offline: "You are offline. Connect to save.",
	deleteBody: "Your Transactions stay as they are.",
	renameTitle: "Rename view",
} as const;

/** "Delete “Food last month”?": the view delete's question (BR-F03-69). */
export function deleteViewTitle(name: string): string {
	return `Delete “${name}”?`;
}

/** F03 section 8's messages for the search box and the filter controls (BR-F03-37 to
 * BR-F03-39). */
export const FILTER_TEXT = {
	searchTooShort: "Type at least 3 characters, or an amount.",
	searchOffline: "Search needs a connection",
	categoryNote: "Category filters hide Goal Transactions.",
	fromAfterTo: "Choose a From date on or before To.",
	minAboveMax: "Choose a Min at or below Max.",
	noMatches: "No matches",
} as const;

/** "Choose a date from 6 Oct to 16 Oct.": an edit's own entry window (D-499), with both ends in
 * F02's short date format. */
export function editWindowMessage(firstOn: string, lastOn: string): string {
	return `Choose a date from ${firstOn} to ${lastOn}.`;
}
