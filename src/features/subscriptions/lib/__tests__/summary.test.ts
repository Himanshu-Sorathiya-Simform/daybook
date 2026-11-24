import { describe, expect, test } from "vitest";

import type { Formats } from "../labels";
import {
	chargeCount,
	subscriptionCount,
	SUMMARY_TEXT,
	summaryFigures,
} from "../summary";

// The golden profile at the golden clock: Asha in Kolkata on 2 November 2026.
const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

/** Section 5's golden list as the summary reads it. */
const GOLDEN = {
	totals: { monthlyMinor: 2027392, yearlyMinor: 24328700, count: 4 },
	thisMonth: { chargedMinor: 1800000, toComeMinor: 214900 },
	upcoming: [
		{ subscriptionId: "a", dueOn: "2026-11-05", amountMinor: 64900 },
		{ subscriptionId: "b", dueOn: "2026-11-10", amountMinor: 150000 },
		{ subscriptionId: "c", dueOn: "2026-12-01", amountMinor: 1800000 },
	],
	upcomingTotalMinor: 2014900,
};

describe("counts (BR-F05-21)", () => {
	test.each([
		[0, "0 Subscriptions"],
		[1, "1 Subscription"],
		[2, "2 Subscriptions"],
		[4, "4 Subscriptions"],
		[12, "12 Subscriptions"],
	])("%i Subscriptions read %j", (count, text) => {
		expect(subscriptionCount(count)).toBe(text);
	});

	test.each([
		[0, "0 charges"],
		[1, "1 charge"],
		[3, "3 charges"],
		[5, "5 charges"],
	])("%i charges read %j", (count, text) => {
		expect(chargeCount(count)).toBe(text);
	});
});

describe("summaryFigures, golden at 2 November (BR-F05-17, BR-F05-18, BR-F05-20, BR-F05-21)", () => {
	const figures = summaryFigures(GOLDEN, F);

	test("the monthly cost is the total's monthly figure for the readout", () => {
		expect(figures.monthlyMinor).toBe(2027392);
	});

	test("the yearly line gives the yearly cost and the Subscriptions counted", () => {
		expect(figures.yearlyLine).toBe("₹2,43,287.00 a year · 4 Subscriptions");
	});

	test("the month is named and its total written as in all", () => {
		expect(figures.monthName).toBe("November");
		expect(figures.inAll).toBe("₹20,149.00 in all");
	});

	test("charged and still to come are written with their words", () => {
		expect(figures.charged).toBe("Charged ₹18,000.00");
		expect(figures.stillToCome).toBe("Still to come ₹2,149.00");
	});

	test("the bar's charged part is the charged share of the month", () => {
		expect(figures.chargedPercent).toBeCloseTo((1800000 / 2014900) * 100, 10);
	});

	test("the next 30 days give the count and the total", () => {
		expect(figures.nextTitle).toBe("Next 30 days · 3 charges");
		expect(figures.nextTotal).toBe("₹20,149.00");
	});
});

describe("summaryFigures edge cases", () => {
	const only = (changes: Partial<typeof GOLDEN>) =>
		summaryFigures({ ...GOLDEN, ...changes }, F);

	test("one Subscription and one charge use the singular", () => {
		const figures = only({
			totals: { monthlyMinor: 64900, yearlyMinor: 778800, count: 1 },
			upcoming: [GOLDEN.upcoming[0]!],
			upcomingTotalMinor: 64900,
		});
		expect(figures.yearlyLine).toBe("₹7,788.00 a year · 1 Subscription");
		expect(figures.nextTitle).toBe("Next 30 days · 1 charge");
	});

	test("no Subscription with a next due date counts none and no charge is coming", () => {
		const figures = only({
			totals: { monthlyMinor: 0, yearlyMinor: 0, count: 0 },
			upcoming: [],
			upcomingTotalMinor: 0,
		});
		expect(figures.yearlyLine).toBe("₹0.00 a year · 0 Subscriptions");
		expect(figures.nextTitle).toBe("Next 30 days · 0 charges");
		expect(figures.nextTotal).toBe("₹0.00");
	});

	test("a month with nothing charged and nothing to come draws an empty bar", () => {
		const figures = only({
			thisMonth: { chargedMinor: 0, toComeMinor: 0 },
		});
		expect(figures.chargedPercent).toBe(0);
		expect(figures.inAll).toBe("₹0.00 in all");
	});

	test("a month with everything charged draws a full bar", () => {
		const figures = only({
			thisMonth: { chargedMinor: 500000, toComeMinor: 0 },
		});
		expect(figures.chargedPercent).toBe(100);
	});

	test("a month with nothing charged yet draws an empty bar", () => {
		const figures = only({
			thisMonth: { chargedMinor: 0, toComeMinor: 500000 },
		});
		expect(figures.chargedPercent).toBe(0);
		expect(figures.charged).toBe("Charged ₹0.00");
	});

	test("a charged figure below zero never draws a negative bar", () => {
		const figures = only({
			thisMonth: { chargedMinor: -1000, toComeMinor: 5000 },
		});
		expect(figures.chargedPercent).toBe(0);
	});

	test("a negative to-come figure never draws a bar past full", () => {
		const figures = only({
			thisMonth: { chargedMinor: 5000, toComeMinor: -1000 },
		});
		expect(figures.chargedPercent).toBe(100);
	});

	test("a month with a single minor unit charged draws a full bar", () => {
		const figures = only({
			thisMonth: { chargedMinor: 1, toComeMinor: 0 },
		});
		expect(figures.chargedPercent).toBe(100);
	});

	test("a half-charged month draws half a bar", () => {
		const figures = only({
			thisMonth: { chargedMinor: 100, toComeMinor: 100 },
		});
		expect(figures.chargedPercent).toBe(50);
	});

	test("the total counts paused ones as the list gave it, not recomputed", () => {
		const figures = only({
			totals: { monthlyMinor: 1, yearlyMinor: 12, count: 7 },
		});
		expect(figures.monthlyMinor).toBe(1);
		expect(figures.yearlyLine).toBe("₹0.12 a year · 7 Subscriptions");
	});
});

describe("summaryFigures follow the profile's formats (BR-F05-49)", () => {
	test("the amounts use the currency and number format", () => {
		const figures = summaryFigures(GOLDEN, {
			currency: "USD",
			numberLocale: "en-US",
			dateLocale: "en-US",
			today: "2026-11-02",
		});
		expect(figures.yearlyLine).toBe("$243,287.00 a year · 4 Subscriptions");
		expect(figures.charged).toBe("Charged $18,000.00");
	});

	test("the month is named in the date locale", () => {
		const german = summaryFigures(GOLDEN, {
			currency: "EUR",
			numberLocale: "de-DE",
			dateLocale: "de-DE",
			today: "2026-03-09",
		});
		expect(german.monthName).toBe("März");
	});

	test("the month follows today's month, across a year end", () => {
		const december = summaryFigures(GOLDEN, { ...F, today: "2026-12-31" });
		expect(december.monthName).toBe("December");
		const january = summaryFigures(GOLDEN, { ...F, today: "2027-01-01" });
		expect(january.monthName).toBe("January");
	});

	test("a currency with no decimals writes whole amounts", () => {
		const yen = summaryFigures(
			{
				...GOLDEN,
				totals: { monthlyMinor: 1500, yearlyMinor: 18000, count: 2 },
			},
			{ ...F, currency: "JPY", numberLocale: "ja-JP", dateLocale: "ja-JP" },
		);
		expect(yen.yearlyLine).toBe("￥18,000 a year · 2 Subscriptions");
	});
});

test("the summary's fixed words", () => {
	expect(SUMMARY_TEXT).toEqual({
		monthlyCost: "Monthly cost",
		charged: "Charged",
		stillToCome: "Still to come",
		nextThirtyDays: "Next 30 days",
	});
});
