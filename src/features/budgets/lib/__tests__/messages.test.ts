import { describe, expect, test } from "vitest";

import {
	asOfText,
	BUDGETS_TEXT,
	budgetExistsMessage,
	emptyTitle,
	monthLabel,
	offlineAction,
	offlineBody,
	PAGE_TEXT,
} from "../messages";

describe("the page's own messages (F04 section 8)", () => {
	test("each reads as section 8 writes it", () => {
		expect(BUDGETS_TEXT).toEqual({
			saveFailed:
				"The Budget could not be saved. Check your connection and try again. Your changes are still here.",
			deleteFailed:
				"The Budget could not be deleted. Check your connection and try again.",
			noticeFailed:
				"The Budget could not be saved. Check your connection and try again.",
			deletedElsewhere: "This Budget was deleted on another device.",
		});
	});

	test.each([
		[
			"Shopping",
			"A Shopping Budget already exists. We opened it so you can change it.",
		],
		[
			"Health",
			"A Health Budget already exists. We opened it so you can change it.",
		],
		[
			"Personal care",
			"A Personal care Budget already exists. We opened it so you can change it.",
		],
		[
			"Entertainment",
			"An Entertainment Budget already exists. We opened it so you can change it.",
		],
		[
			"Other",
			"An Other Budget already exists. We opened it so you can change it.",
		],
	])("budget_exists names the category: %s", (label, text) => {
		expect(budgetExistsMessage(label)).toBe(text);
	});
});

describe("the page's words (BR-F04-14, section 6, section 8)", () => {
	test("each reads as the spec writes it", () => {
		expect(PAGE_TEXT).toEqual({
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
			loadFailedBody:
				"Check your connection, then try again. Your Budgets are safe.",
			retry: "Retry",
			emptyBody: "Budgets apply from the month you choose.",
			offlineTitle: "You're offline. This month isn't saved on this device.",
		});
	});

	test("the current month reads to date; any other month reads as itself", () => {
		expect(monthLabel("November 2026", true)).toBe("November 2026 · to date");
		expect(monthLabel("October 2026", false)).toBe("October 2026");
	});

	test("the empty and offline messages name their months", () => {
		expect(emptyTitle("September 2026")).toBe("No Budgets for September 2026.");
		expect(offlineBody("November 2026")).toBe(
			"Only November 2026 is kept for offline use.",
		);
		expect(offlineAction("November")).toBe("Go to November");
	});
});

describe("asOfText (section 10)", () => {
	const formats = { dateLocale: "en-IN", timezone: "Asia/Kolkata" };
	// The golden clock, 2026-11-02T12:00:00+05:30 (TST-3).
	const loadedAt = Date.parse("2026-11-02T12:00:00+05:30");

	test("offline, with a month loaded, says when, in the profile's zone", () => {
		expect(asOfText(false, loadedAt, formats)).toBe("as of 12:00 pm");
	});

	test("online, it says nothing", () => {
		expect(asOfText(true, loadedAt, formats)).toBeNull();
	});

	test("offline with nothing loaded, it says nothing", () => {
		expect(asOfText(false, 0, formats)).toBeNull();
	});
});
