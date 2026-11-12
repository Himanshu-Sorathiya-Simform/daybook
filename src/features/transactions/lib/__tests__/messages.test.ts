import { describe, expect, test } from "vitest";

import {
	deleteViewTitle,
	editWindowMessage,
	TRANSACTIONS_TEXT,
	VIEW_TEXT,
} from "../messages";

describe("TRANSACTIONS_TEXT (F03 section 8)", () => {
	test.each([
		["saveFailed", "Your change wasn't saved. Try again."],
		["deletedElsewhere", "This Transaction was deleted on another device."],
		["deleteTitle", "Delete this Transaction?"],
		["deleteBody", "It leaves your list now. You can undo for 5 seconds."],
		["deleted", "Transaction deleted."],
		["undo", "Undo"],
		["deleteFailed", "Couldn't delete. Check your connection and try again."],
		["notFound", "We couldn't find that Transaction."],
		["viewChanged", "This view changed on another device. Try again."],
		["viewDeleted", "This view was deleted on another device."],
		["invalidLink", "Some filters in this link weren't valid and were removed."],
	] as const)("%s reads as the spec says", (key, text) => {
		expect(TRANSACTIONS_TEXT[key]).toBe(text);
	});
});

describe("editWindowMessage (D-499)", () => {
	test("names the row's own window", () => {
		expect(editWindowMessage("6 Oct", "16 Oct")).toBe(
			"Choose a date from 6 Oct to 16 Oct.",
		);
	});
});

describe("VIEW_TEXT (F03 section 8, BR-F03-66 to BR-F03-69)", () => {
	test.each([
		["saved", "Saved as a new view."],
		["updated", "View updated."],
		["renamed", "View renamed."],
		["deleted", "View deleted."],
		["hint", "Change a filter, then save it as a view."],
		["offline", "You are offline. Connect to save."],
		["deleteBody", "Your Transactions stay as they are."],
		["renameTitle", "Rename view"],
	] as const)("%s reads as the spec says", (key, text) => {
		expect(VIEW_TEXT[key]).toBe(text);
	});
});

describe("deleteViewTitle (BR-F03-69)", () => {
	test("names the view in curly quotes", () => {
		expect(deleteViewTitle("Food last month")).toBe("Delete “Food last month”?");
	});
});
