import { describe, expect, test } from "vitest";

import {
	attentionFigure,
	dayOfMonth,
	filterEmptyText,
	type Formats,
	groupLabel,
	headline,
	inactiveText,
	leftFigure,
	LIST_TEXT,
	TABLE_TEXT,
	tableCaption,
	noLimitCaption,
	overviewFigures,
	overviewLabel,
	percentOf,
	rowFigures,
	sourceText,
	spentOfLimit,
	STATE_TONES,
	tickCaption,
	todayCaption,
} from "../labels";
import { monthAnswer } from "./fixtures";

/** The golden profile's formats. */
const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

const OCTOBER = monthAnswer("2026-10");
const SEPTEMBER = monthAnswer("2026-09");
const row = (view: typeof OCTOBER, category: string) =>
	view.budgets.find((each) => each.category === category)!;

describe("a row's headline (BR-F04-16)", () => {
	// F04 section 5: October food is 1,220.00 over; September food has 950.00 left.
	test("over the limit reads Over by, else what is left", () => {
		expect(headline(-122000, IN)).toBe("Over by ₹1,220.00");
		expect(headline(95000, IN)).toBe("₹950.00 left");
	});

	test("exactly at the limit has nothing left", () => {
		expect(headline(0, IN)).toBe("₹0.00 left");
	});

	test("one minor unit over is over", () => {
		expect(headline(-1, IN)).toBe("Over by ₹0.01");
	});

	test("in another currency and locale", () => {
		expect(
			headline(-1500, { ...IN, currency: "JPY", numberLocale: "ja-JP" }),
		).toBe("Over by ￥1,500");
	});
});

describe("a row's figures (BR-F04-16)", () => {
	// F04 section 5, the October page.
	test.each([
		["food", "₹6,220.00 of ₹5,000.00 · 124.4% · Over budget"],
		["shopping", "₹3,000.00 of ₹3,000.00 · 100.0% · At limit"],
		["entertainment", "₹2,148.00 of ₹1,000.00 · 214.8% · Over budget"],
		["transportation", "₹1,800.00 of ₹2,000.00 · 90.0% · Nearing limit"],
	])("October %s reads %s, the state in words", (category, text) => {
		expect(rowFigures(row(OCTOBER, category), IN)).toBe(text);
	});

	test("September shopping at exactly 80.0% is Nearing limit, and entertainment On track", () => {
		expect(rowFigures(row(SEPTEMBER, "shopping"), IN)).toBe(
			"₹2,400.00 of ₹3,000.00 · 80.0% · Nearing limit",
		);
		expect(rowFigures(row(SEPTEMBER, "entertainment"), IN)).toBe(
			"₹649.00 of ₹1,000.00 · 64.9% · On track",
		);
	});

	test("the start of the figures leaves the state out, for a page that colours it", () => {
		expect(spentOfLimit(row(OCTOBER, "food"), IN)).toBe(
			"₹6,220.00 of ₹5,000.00 · 124.4%",
		);
	});

	// BR-F04-08: refunds above expenses.
	test("a negative spent reads negative and On track", () => {
		expect(
			rowFigures(
				{ spentMinor: -12000, limitMinor: 300000, utilizationTenths: -40 },
				IN,
			),
		).toBe("−₹120.00 of ₹3,000.00 · −4.0% · On track");
	});

	test("percent has one decimal", () => {
		expect(percentOf(1197, IN)).toBe("119.7%");
		expect(percentOf(0, IN)).toBe("0.0%");
		expect(percentOf(38, IN)).toBe("3.8%");
	});
});

describe("the limit's source (BR-F04-16)", () => {
	// F04 section 5: food in October and in September.
	test("a schedule entry, then the next one", () => {
		expect(
			sourceText(row(OCTOBER, "food").source, row(OCTOBER, "food").next, IN),
		).toBe("₹5,000.00 from Oct 2026");
		expect(
			sourceText(
				row(SEPTEMBER, "food").source,
				row(SEPTEMBER, "food").next,
				IN,
			),
		).toBe("₹6,000.00 from Sept 2026, then ₹5,000.00 from Oct 2026");
	});

	test("a one-month limit", () => {
		expect(
			sourceText(
				{ kind: "override", month: "2026-10", limitMinor: 800000 },
				null,
				IN,
			),
		).toBe("One-month limit for Oct 2026");
	});

	test("a one-month limit is followed by the next schedule entry too", () => {
		expect(
			sourceText(
				{ kind: "override", month: "2026-10", limitMinor: 800000 },
				{ from: "2026-12", limitMinor: 700000 },
				IN,
			),
		).toBe("One-month limit for Oct 2026, then ₹7,000.00 from Dec 2026");
	});

	test("a next entry that stops reads stops from", () => {
		expect(
			sourceText(
				{ kind: "schedule", from: "2026-10", limitMinor: 500000 },
				{ from: "2026-12", limitMinor: null },
				IN,
			),
		).toBe("₹5,000.00 from Oct 2026, then stops from Dec 2026");
	});

	test("months are the locale's own: en-US writes Sep", () => {
		expect(
			sourceText(row(SEPTEMBER, "food").source, null, {
				...IN,
				dateLocale: "en-US",
			}),
		).toBe("₹6,000.00 from Sep 2026");
	});
});

describe("why a record is Not active (BR-F04-34)", () => {
	// F04 section 5: transportation in September starts in October.
	test("a Budget that starts later", () => {
		expect(
			inactiveText({ status: "starts", from: "2026-10" }, "2026-09", IN),
		).toBe("Starts October 2026");
	});

	// F04 section 13: stopped, then restarted.
	test("a stopped Budget, with or without a restart", () => {
		expect(
			inactiveText(
				{ status: "stopped", from: "2026-11", restartsFrom: "2027-02" },
				"2026-12",
				IN,
			),
		).toBe("Stopped from November 2026, starts again February 2027");
		expect(
			inactiveText(
				{ status: "stopped", from: "2026-11", restartsFrom: null },
				"2026-12",
				IN,
			),
		).toBe("Stopped from November 2026");
	});

	test("no limit for one month only", () => {
		expect(inactiveText({ status: "skipped" }, "2026-10", IN)).toBe(
			"No limit for October 2026 only",
		);
	});
});

describe("the groups' figures (BR-F04-15)", () => {
	// F04 section 5: October's Needs attention is 1,148.00 + 1,220.00 over.
	test("Needs attention sums what is over the limits when any row is over", () => {
		const attention = OCTOBER.budgets.filter((each) => each.state !== "ok");
		expect(attentionFigure(attention, IN)).toBe("₹2,368.00 over in total");
	});

	// F04 section 5: September's Needs attention has 1,550.00 left.
	test("with no row over, it sums what is left", () => {
		const attention = SEPTEMBER.budgets.filter((each) => each.state !== "ok");
		expect(attentionFigure(attention, IN)).toBe("₹1,550.00 left");
	});

	test("a row exactly at its limit adds nothing over and nothing left", () => {
		expect(attentionFigure([{ remainingMinor: 0 }], IN)).toBe("₹0.00 left");
	});

	// F04 section 5: September's On track has 351.00 left.
	test("On track sums what is left", () => {
		const track = SEPTEMBER.budgets.filter((each) => each.state === "ok");
		expect(leftFigure(track, IN)).toBe("₹351.00 left");
	});

	test("a negative spent leaves more than the limit, counted as left", () => {
		expect(leftFigure([{ remainingMinor: 312000 }], IN)).toBe("₹3,120.00 left");
	});

	test("a group's header reads its name and count", () => {
		expect(groupLabel(LIST_TEXT.attention, 4)).toBe("Needs attention · 4");
		expect(groupLabel(LIST_TEXT.notActive, 1)).toBe("Not active this month · 1");
	});
});

describe("the overview (BR-F04-15)", () => {
	// F04 section 5: October overall.
	test("October reads of ₹11,000.00 · 119.7% and Over by ₹2,168.00", () => {
		expect(
			overviewFigures(
				{
					limitMinor: 1100000,
					spentMinor: 1316800,
					utilizationTenths: 1197,
				},
				IN,
			),
		).toEqual({ total: "of ₹11,000.00 · 119.7%", state: "Over by ₹2,168.00" });
	});

	// F04 section 5: September overall.
	test("September reads ₹1,901.00 left", () => {
		expect(
			overviewFigures(
				{ limitMinor: 1000000, spentMinor: 809900, utilizationTenths: 810 },
				IN,
			),
		).toEqual({ total: "of ₹10,000.00 · 81.0%", state: "₹1,901.00 left" });
	});

	test("the label names the month alone", () => {
		expect(overviewLabel("2026-10", IN)).toBe("Budgeted spending in October");
	});

	test("the tick's caption names the limit", () => {
		expect(
			tickCaption({ limitMinor: 1100000, utilizationTenths: 1197 }, IN),
		).toBe("Black tick: the ₹11,000.00 limit.");
	});

	test("past 160% it says the bar stops; at exactly 160% it does not", () => {
		expect(
			tickCaption({ limitMinor: 100000, utilizationTenths: 1601 }, IN),
		).toBe("Black tick: the ₹1,000.00 limit. The bar stops at 160%.");
		expect(
			tickCaption({ limitMinor: 100000, utilizationTenths: 1600 }, IN),
		).toBe("Black tick: the ₹1,000.00 limit.");
	});

	// F04 section 5: the golden clock's day 2 of November's 30.
	test("today's caption and share", () => {
		expect(dayOfMonth("2026-11-02")).toEqual({
			day: 2,
			days: 30,
			share: 2 / 30,
		});
		expect(todayCaption(2, 30)).toBe("Blue: day 2 of 30");
	});

	test.each([
		["2026-02-28", 28, 28],
		["2028-02-29", 29, 29],
		["2026-12-31", 31, 31],
		["2026-10-01", 1, 31],
	])("%s is day %i of %i", (today, day, days) => {
		expect(dayOfMonth(today)).toMatchObject({ day, days });
	});
});

describe("other words", () => {
	test("a Not budgeted row's caption names the month", () => {
		expect(noLimitCaption("2026-10", IN)).toBe("No limit in October");
	});

	// BR-F04-31
	test.each([
		["over", "No Budgets are over budget in October 2026."],
		["at", "No Budgets are at their limit in October 2026."],
		["warning", "No Budgets are nearing their limit in October 2026."],
		["ok", "No Budgets are on track in October 2026."],
	] as const)("the empty filter for %s reads %s", (state, text) => {
		expect(filterEmptyText(state, "2026-10", IN)).toBe(text);
	});

	test("each state has its colour: over, then warning for At limit and Nearing limit", () => {
		expect(STATE_TONES).toEqual({
			over: "text-neg",
			at: "text-warn",
			warning: "text-warn",
			ok: "text-ink",
		});
	});

	test("the list's words", () => {
		expect(LIST_TEXT).toEqual({
			label: "Budgets",
			attention: "Needs attention",
			onTrack: "On track",
			notBudgeted: "Not budgeted",
			notActive: "Not active this month",
			showing: "Showing",
			showAll: "Show all",
			showAllBudgets: "Show all Budgets",
			changeLimit: "Change limit",
			delete: "Delete",
			totalSpending: "Total spending",
		});
	});

	test("the table's caption names the month in the profile's format (BR-F04-18)", () => {
		expect(tableCaption("2026-10", IN)).toBe(
			"October 2026. Select a column heading to sort.",
		);
		expect(tableCaption("2026-09", { ...IN, dateLocale: "de-DE" })).toBe(
			"September 2026. Select a column heading to sort.",
		);
	});

	test("the table's words (BR-F04-18)", () => {
		expect(TABLE_TEXT).toEqual({
			category: "Category",
			limit: "Limit",
			spent: "Spent",
			remaining: "Remaining",
			utilization: "Utilization",
			state: "State",
			total: "Budgeted total",
			notBudgeted: "Not budgeted",
			none: "—",
		});
	});
});
