import { describe, expect, test } from "vitest";

import type { LabelLocale } from "../labels";
import {
	categoryBars,
	DETAIL_HINT,
	detailDate,
	detailRows,
	detailSource,
	detailTitle,
	historyLine,
	historyTitle,
	newerRow,
	ordinal,
	PANEL_TEXT,
	rowInPages,
	summaryHeading,
	topPayees,
} from "../panel";
import { CHECK_A_SUMMARY, idOf, page, row } from "./fixtures";

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

// Golden #16 at M1: the Netflix charge of 5 Oct, unlinked (D-475).
const ROW_16 = row({
	amountMinor: 64900,
	occurredOn: "2026-10-05",
	occurredAt: "2026-10-04T18:30:00.000Z",
	category: "entertainment",
	payee: "Netflix",
	source: "subscription",
	dueOn: "2026-10-05",
});

describe("PANEL_TEXT (F03 section 8)", () => {
	test("holds the panel's words", () => {
		expect(PANEL_TEXT).toEqual({
			label: "Transaction details",
			list: "This list",
			byCategory: "Out by category",
			topPayees: "Top payees by Out",
			summaryHint:
				"Select a Transaction to see it here. Up and down arrows move, Enter opens.",
			heading: "Transaction",
			close: "Close details",
			none: "None",
			chargeDeleted: "From a deleted Subscription",
			demo: "Demo data",
			failed: "This Transaction could not be loaded.",
		});
	});

	test("the detail hint names every key", () => {
		expect(DETAIL_HINT).toBe(
			"E to edit · D to duplicate · Delete to delete · Esc to close",
		);
	});
});

describe("summaryHeading (BR-F03-71)", () => {
	// AC-F03-56
	test("check A at M1 reads 11 Transactions from 1 Oct to 31 Oct", () => {
		expect(summaryHeading(CHECK_A_SUMMARY, IN)).toEqual({
			count: "11 Transactions",
			span: "1 Oct to 31 Oct",
		});
	});

	test("one Transaction reads in the singular", () => {
		expect(
			summaryHeading(
				{ count: 1, firstOn: "2026-10-19", lastOn: "2026-10-19" },
				IN,
			).count,
		).toBe("1 Transaction");
	});

	test("the same first and last day shows that one date", () => {
		expect(
			summaryHeading(
				{ count: 3, firstOn: "2026-10-19", lastOn: "2026-10-19" },
				IN,
			).span,
		).toBe("19 Oct");
	});

	test("a span outside the current year shows the year, as F02's short date does", () => {
		expect(
			summaryHeading(
				{ count: 2, firstOn: "2025-12-30", lastOn: "2026-01-02" },
				IN,
			).span,
		).toBe("30 Dec 2025 to 2 Jan");
	});

	test("no rows leave the span out", () => {
		expect(
			summaryHeading({ count: 0, firstOn: null, lastOn: null }, IN),
		).toEqual({
			count: "0 Transactions",
			span: null,
		});
	});

	test("a span with a missing end is left out", () => {
		expect(
			summaryHeading({ count: 2, firstOn: "2026-10-01", lastOn: null }, IN)
				.span,
		).toBeNull();
		expect(
			summaryHeading({ count: 2, firstOn: null, lastOn: "2026-10-01" }, IN)
				.span,
		).toBeNull();
	});
});

describe("categoryBars (BR-F03-71)", () => {
	test("check A: each category's Out, its bar against housing's 18,000.00", () => {
		expect(categoryBars(CHECK_A_SUMMARY.byCategory)).toEqual([
			{ key: "housing", outMinor: 1800000, share: 1 },
			{ key: "food", outMinor: 622000, share: 622000 / 1800000 },
			{ key: "shopping", outMinor: 300000, share: 300000 / 1800000 },
			{ key: "entertainment", outMinor: 214800, share: 214800 / 1800000 },
			{ key: "transportation", outMinor: 180000, share: 180000 / 1800000 },
		]);
	});

	test("no breakdown gives no bars", () => {
		expect(categoryBars(undefined)).toEqual([]);
		expect(categoryBars([])).toEqual([]);
	});

	test("a negative Out, where refunds outweigh spending, draws no bar", () => {
		expect(
			categoryBars([
				{ key: "food", label: null, count: 1, outMinor: 1000 },
				{ key: "shopping", label: null, count: 2, outMinor: -500 },
			]),
		).toEqual([
			{ key: "food", outMinor: 1000, share: 1 },
			{ key: "shopping", outMinor: -500, share: 0 },
		]);
	});

	test("with only negative or zero Outs, no bar has a length", () => {
		expect(
			categoryBars([
				{ key: "shopping", label: null, count: 1, outMinor: -500 },
				{ key: "food", label: null, count: 1, outMinor: 0 },
			]).map((bar) => bar.share),
		).toEqual([0, 0]);
	});
});

describe("topPayees (BR-F03-71)", () => {
	test("check A: the first 4 of the 6", () => {
		expect(
			topPayees(CHECK_A_SUMMARY.byPayee).map((each) => [
				each.label,
				each.outMinor,
				each.count,
			]),
		).toEqual([
			["Sunrise Apartments", 1800000, 1],
			["Croma", 300000, 2],
			["BigBasket", 290000, 1],
			["Zomato", 230000, 1],
		]);
	});

	test("fewer than 4 are all shown, and none gives none", () => {
		expect(topPayees(CHECK_A_SUMMARY.byPayee!.slice(0, 2))).toHaveLength(2);
		expect(topPayees(undefined)).toEqual([]);
	});
});

describe("detailTitle (BR-F03-72)", () => {
	test("the payee", () => {
		expect(detailTitle(row())).toBe("Swiggy");
	});

	test("Goal rows read To Goal and From Goal until M2 names the Goal", () => {
		expect(detailTitle({ type: "goal_contribution", payee: null })).toBe(
			"To Goal",
		);
		expect(detailTitle({ type: "goal_withdrawal", payee: null })).toBe(
			"From Goal",
		);
	});

	test("a row without a payee has an empty title", () => {
		expect(detailTitle({ type: "expense", payee: null })).toBe("");
	});
});

describe("detailDate (BR-F03-72)", () => {
	test("#24: the day with its year, then the time in the profile zone", () => {
		expect(detailDate(row(), IN)).toBe("Mon, 19 Oct, 2026 · 10:15 pm");
	});

	// AC-F03-57
	test("#16, a charge: Auto in place of the time", () => {
		expect(detailDate(ROW_16, IN)).toBe("Mon, 5 Oct, 2026 · Auto");
	});

	test("the time follows the profile zone and the date stays the stored one", () => {
		expect(
			detailDate(
				row({
					occurredOn: "2026-11-01",
					occurredAt: "2026-10-31T19:00:00.000Z",
				}),
				{ ...IN, timezone: "America/Los_Angeles" },
			),
		).toBe("Sun, 1 Nov, 2026 · 12:00 pm");
	});
});

describe("detailSource (BR-F03-72)", () => {
	test("a manual row was added by you", () => {
		expect(detailSource(row())).toBe("Added by you");
	});

	// AC-F03-57
	test("an unlinked charge is from a deleted Subscription", () => {
		expect(detailSource(ROW_16)).toBe("From a deleted Subscription");
	});

	test("a linked charge is auto from its payee", () => {
		expect(
			detailSource({
				...ROW_16,
				subscriptionId: "0192f0c4-7a1e-7c3b-9d2a-000000000001",
			}),
		).toBe("Auto from Netflix");
	});

	test("any demo row reads Demo data, a charge or not", () => {
		expect(detailSource(row({ demo: true }))).toBe("Demo data");
		expect(detailSource({ ...ROW_16, demo: true })).toBe("Demo data");
	});
});

describe("detailRows (BR-F03-72)", () => {
	// AC-F03-57
	test("#24: Expense, Food, its date, Added by you and no note", () => {
		expect(detailRows(row(), IN)).toEqual([
			{ term: "Type", value: "Expense" },
			{ term: "Category", value: "Food" },
			{ term: "Date", value: "Mon, 19 Oct, 2026 · 10:15 pm" },
			{ term: "Source", value: "Added by you" },
			{ term: "Note", value: "None" },
		]);
	});

	test("a note shows as written, line breaks kept", () => {
		expect(detailRows(row({ note: "Dinner\nwith Asha" }), IN).at(-1)).toEqual({
			term: "Note",
			value: "Dinner\nwith Asha",
		});
	});

	test("a Goal row shows a Goal row in place of the category", () => {
		expect(
			detailRows(
				row({ type: "goal_contribution", category: null, payee: null }),
				IN,
			).slice(0, 2),
		).toEqual([
			{ term: "Type", value: "To Goal" },
			{ term: "Goal", value: "Goal" },
		]);
	});
});

describe("ordinal (BR-F03-72)", () => {
	test.each([
		[1, "1st"],
		[2, "2nd"],
		[3, "3rd"],
		[4, "4th"],
		[5, "5th"],
		[11, "11th"],
		[12, "12th"],
		[13, "13th"],
		[21, "21st"],
		[22, "22nd"],
		[23, "23rd"],
		[30, "30th"],
		[31, "31st"],
	])("%i reads %s", (day, text) => {
		expect(ordinal(day)).toBe(text);
	});
});

describe("historyTitle and historyLine (BR-F03-72)", () => {
	test("the box's title", () => {
		expect(historyTitle("Swiggy", 3)).toBe("Swiggy in the last 3 months");
	});

	// AC-F03-57
	test("#24, Swiggy: 4 rows, their Out and the usual day", () => {
		expect(
			historyLine(
				{ count: 4, inMinor: 0, outMinor: 329000, usualDay: 3 },
				"expense",
				IN,
			),
		).toBe("4 Transactions · ₹3,290.00 · usually around the 3rd");
	});

	// AC-F03-57
	test("#13, Acme Corp: income shows In, in India's grouping", () => {
		expect(
			historyLine(
				{ count: 2, inMinor: 17000000, outMinor: 0, usualDay: 1 },
				"income",
				IN,
			),
		).toBe("2 Transactions · ₹1,70,000.00 · usually around the 1st");
	});

	// AC-F03-57
	test("#11, Studio Nine: one row has no usual day", () => {
		expect(
			historyLine(
				{ count: 1, inMinor: 1200000, outMinor: 0, usualDay: null },
				"income",
				IN,
			),
		).toBe("1 Transaction · ₹12,000.00");
	});

	// AC-F03-57
	test("#16, Netflix: the charge's Out and the 5th", () => {
		expect(
			historyLine(
				{ count: 2, inMinor: 0, outMinor: 129800, usualDay: 5 },
				"expense",
				IN,
			),
		).toBe("2 Transactions · ₹1,298.00 · usually around the 5th");
	});

	test("a refund row shows Out too, here below zero", () => {
		expect(
			historyLine(
				{ count: 2, inMinor: 0, outMinor: -150000, usualDay: null },
				"refund",
				IN,
			),
		).toBe("2 Transactions · −₹1,500.00");
	});

	test("no rows leave the box out", () => {
		expect(
			historyLine(
				{ count: 0, inMinor: 0, outMinor: 0, usualDay: null },
				"expense",
				IN,
			),
		).toBeNull();
	});
});

describe("rowInPages (BR-F03-53)", () => {
	const A = row({ id: idOf(1), payee: "Swiggy" });
	const B = row({ id: idOf(2), payee: "Zomato" });

	test("finds a row on the first page, with the page's currency", () => {
		expect(rowInPages([page({ items: [A, B] })], idOf(2))).toEqual({
			...B,
			currency: "INR",
		});
	});

	test("finds a row on a later page", () => {
		const pages = [page({ items: [A] }), page({ items: [B] })];
		expect(rowInPages(pages, idOf(2))?.payee).toBe("Zomato");
	});

	test("takes the currency from the page that holds the row", () => {
		const pages = [
			page({ items: [A], currency: "INR" }),
			page({ items: [B], currency: "USD" }),
		];
		expect(rowInPages(pages, idOf(2))?.currency).toBe("USD");
		expect(rowInPages(pages, idOf(1))?.currency).toBe("INR");
	});

	test("is undefined for an id no page holds, or for no pages", () => {
		expect(rowInPages([page({ items: [A] })], idOf(9))).toBeUndefined();
		expect(rowInPages([page()], idOf(1))).toBeUndefined();
		expect(rowInPages([], idOf(1))).toBeUndefined();
	});
});

describe("newerRow (BR-F03-73)", () => {
	const OLD = row({ version: 1, payee: "Swiggy" });
	const NEW = row({ version: 2, payee: "Swiggy Instamart" });

	test("the row asked for alone wins when its version is higher", () => {
		expect(newerRow(OLD, NEW)).toBe(NEW);
	});

	test("the row from the pages wins when its version is higher", () => {
		expect(newerRow(NEW, OLD)).toBe(NEW);
	});

	test("the row from the pages wins on equal versions", () => {
		const same = row({ version: 1, payee: "Other" });
		expect(newerRow(OLD, same)).toBe(OLD);
	});

	test("takes the one there is when only one is", () => {
		expect(newerRow(OLD, undefined)).toBe(OLD);
		expect(newerRow(undefined, NEW)).toBe(NEW);
	});

	test("is undefined when neither is", () => {
		expect(newerRow(undefined, undefined)).toBeUndefined();
	});
});
