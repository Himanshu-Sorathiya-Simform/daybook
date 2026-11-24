import { describe, expect, test } from "vitest";

import {
	addedMessage,
	DASHBOARD_MESSAGES as M,
	DELETE_VIEW_TEXT,
	deleteViewTitle,
	hiddenMessage,
	movedMessage,
	SIZE_LABELS,
	sizedMessage,
} from "../messages";

/** F08 section 8's strings, word for word: the page, the server and the tests write the same
 * words, so a change here is a change to the spec. */
describe("F08 section 8's messages", () => {
	test.each([
		["keepOne", "Keep at least one widget on your dashboard."],
		["resetConfirm", "Reset your dashboard to the default layout?"],
		["resetDone", "Reset to the default layout."],
		["copyNotice", "Overview is ours, so you are editing your own copy of it."],
		["tooManyViews", "You can save up to 5 views of your own."],
		["nameRequired", "Enter a name for this view."],
		["nameTooLong", "Use 40 characters or fewer."],
		["saveFailed", "Your dashboard layout couldn't be saved."],
		["widgetFailed", "This could not be loaded."],
		["noRenewals", "No upcoming renewals."],
		["offlineMonth", "You're offline. This month isn't saved on this device."],
		["monthNotice", "Some filters in this link weren't valid and were removed."],
		["refundsExceeded", "Refunds exceeded spending"],
		["noIncomeYet", "No income yet"],
		["belowZero", "Below zero"],
		["noBudgets", "No Budgets"],
		["nothingRecorded", "Nothing recorded"],
		["selectDay", "Select a day to see its Transactions."],
	] as const)("%s", (key, text) => {
		expect(M[key]).toBe(text);
	});

	test("the API-only messages name what to send", () => {
		expect(M.month).toBe("Use a month as YYYY-MM, from 2000-01 to this month.");
		expect(M.id).toBe("Use a UUIDv7 id.");
		expect(M.boolean).toBe("Send true or false.");
		expect(M.views).toBe("Send 1 to 10 views.");
		expect(M.viewTwice).toBe("Send each view once.");
		expect(M.widgets).toBe("Send the widgets as a list of at most 50.");
	});
});

describe("the announcements (BR-F08-25)", () => {
	test("a move gives the position among the visible widgets", () => {
		expect(movedMessage("Budgets", 2, 8)).toBe(
			"Budgets moved to position 2 of 8.",
		);
	});

	test.each([
		[2, "Goals is now ⅓ width."],
		[3, "Goals is now ½ width."],
		[4, "Goals is now ⅔ width."],
		[6, "Goals is now Full width."],
	] as const)("size %i reads %s", (size, text) => {
		expect(sizedMessage("Goals", size)).toBe(text);
	});

	test("hide and add name the widget", () => {
		expect(hiddenMessage("Investments")).toBe("Investments hidden.");
		expect(addedMessage("Budgets")).toBe("Budgets added.");
	});

	test("the size labels are the design's fractions", () => {
		expect(SIZE_LABELS).toEqual({ 2: "⅓", 3: "½", 4: "⅔", 6: "Full" });
	});
});

describe("Delete a view (BR-F08-28)", () => {
	test("asks with the name in curly quotes, and says it goes everywhere", () => {
		expect(deleteViewTitle("Budget watch")).toBe("Delete “Budget watch”?");
		expect(DELETE_VIEW_TEXT).toBe("This view is removed on every device.");
	});
});
