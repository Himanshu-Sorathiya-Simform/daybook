import { describe, expect, test } from "vitest";

import {
	budgetPath,
	BUDGETS_PATH,
	historyPath,
	monthLimitPath,
	monthPath,
	payeeSummaryPath,
	transactionsHref,
	yearPath,
} from "../paths";

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8001";

describe("the Budgets API paths (F04 section 11)", () => {
	test("the month view and a create", () => {
		expect(BUDGETS_PATH).toBe("/api/budgets");
		expect(monthPath("2026-10")).toBe("/api/budgets?month=2026-10");
	});

	test("one Budget, and one of its one-month limits", () => {
		expect(budgetPath(ID)).toBe(`/api/budgets/${ID}`);
		expect(monthLimitPath(ID, "2026-10")).toBe(
			`/api/budgets/${ID}/overrides/2026-10`,
		);
	});

	test("an id that is not a UUID is encoded, so it can only ever reach the one route", () => {
		expect(budgetPath("a/b?c#d")).toBe("/api/budgets/a%2Fb%3Fc%23d");
		expect(monthLimitPath("a/b", "2026-10")).toBe(
			"/api/budgets/a%2Fb/overrides/2026-10",
		);
	});

	test("the history, with its parameters in the spec's order (BR-F04-35)", () => {
		expect(historyPath("food", "2026-11", 6)).toBe(
			"/api/budgets/history?category=food&to=2026-11&months=6",
		);
		expect(historyPath("personal_care", "2026-10", 37)).toBe(
			"/api/budgets/history?category=personal_care&to=2026-10&months=37",
		);
	});

	test("the year summary (BR-F04-35)", () => {
		expect(yearPath(2026)).toBe("/api/budgets/summary?year=2026");
	});
});

describe("the F03 reads and links for one category's month", () => {
	// AC-F04-10
	test("See 4 Transactions opens October food (flow 7.6, D-111)", () => {
		expect(transactionsHref("food", "2026-10", "INR")).toBe(
			"/transactions?from=2026-10-01&to=2026-10-31&cat=food",
		);
	});

	test("Where it went reads F03's summary of the same filter, with the payee breakdown", () => {
		expect(payeeSummaryPath("food", "2026-10", "INR")).toBe(
			"/api/transactions/summary?from=2026-10-01&to=2026-10-31&cat=food&by=payee",
		);
	});

	test.each([
		["2026-02", "2026-02-28"],
		["2028-02", "2028-02-29"],
		["2026-04", "2026-04-30"],
		["2026-12", "2026-12-31"],
	])("the month %s runs to its last day, %s", (month, last) => {
		expect(transactionsHref("food", month, "INR")).toBe(
			`/transactions?from=${month}-01&to=${last}&cat=food`,
		);
	});

	test("the currency changes nothing, since the filter has no amount", () => {
		expect(payeeSummaryPath("food", "2026-10", "JPY")).toBe(
			payeeSummaryPath("food", "2026-10", "INR"),
		);
		expect(transactionsHref("food", "2026-10", "KWD")).toBe(
			transactionsHref("food", "2026-10", "INR"),
		);
	});

	test("a category with an underscore travels as it is", () => {
		expect(transactionsHref("gifts_donations", "2026-10", "INR")).toBe(
			"/transactions?from=2026-10-01&to=2026-10-31&cat=gifts_donations",
		);
	});
});
