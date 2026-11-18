import { describe, expect, test } from "vitest";

import { GOLDEN_ALL } from "../../../../seed/golden";
import {
	costTotals,
	type DatedSubscription,
	divideRounded,
	dueInMonth,
	expectedMinor,
	type MonthCharge,
	monthItems,
	monthlyMinor,
	monthTotals,
	nextDueOf,
	statusOf,
	upcomingCharges,
	upcomingTotal,
	yearlyMinor,
} from "../model";
import type { Cadence } from "../schedule";
import {
	GOLDEN_TODAY,
	type GoldenSubscription,
	goldenSubscription,
	goldenSubscriptions,
} from "./golden";

const TODAY = GOLDEN_TODAY;

/** A Subscription the rules read: monthly from 5 Sep, charged on 5 Sep and 5 Oct. */
const dated = (changes: Partial<DatedSubscription> = {}): DatedSubscription => ({
	id: "0199a000-0000-7000-8002-000000000099",
	name: "Netflix",
	amountMinor: 64900,
	category: "entertainment",
	note: null,
	startDate: "2026-09-05",
	cadence: { unit: "month", every: 1 },
	chargesFrom: "2026-09-05",
	endDate: null,
	pause: null,
	lastChangeOn: "2026-09-05",
	demo: false,
	version: 1,
	charged: ["2026-09-05", "2026-10-05"],
	skipped: [],
	...changes,
});

const golden = (): DatedSubscription[] =>
	goldenSubscriptions().map((each: GoldenSubscription) => ({
		...each,
		note: null,
		demo: false,
	}));

describe("statusOf (F05 section 3, AC-F05-26)", () => {
	const sub = (changes: Partial<Parameters<typeof statusOf>[0]> = {}) => ({
		startDate: "2026-09-05",
		endDate: null,
		pause: null,
		...changes,
	});

	test("a running Subscription is active", () => {
		expect(statusOf(sub(), TODAY)).toBe("active");
	});

	test("an end date in the future is ending", () => {
		expect(statusOf(sub({ endDate: "2026-11-03" }), TODAY)).toBe("ending");
		expect(statusOf(sub({ endDate: "2036-11-02" }), TODAY)).toBe("ending");
	});

	// D-597: Cancel "Now" moves the row to Ended at once.
	test("an end date of today is ended", () => {
		expect(statusOf(sub({ endDate: TODAY }), TODAY)).toBe("ended");
	});

	test("an end date in the past is ended", () => {
		expect(statusOf(sub({ endDate: "2026-09-30" }), TODAY)).toBe("ended");
		expect(statusOf(sub({ endDate: "2026-11-01" }), TODAY)).toBe("ended");
	});

	test("a start after today is upcoming; a start today is not", () => {
		expect(statusOf(sub({ startDate: "2026-11-03" }), TODAY)).toBe("upcoming");
		expect(statusOf(sub({ startDate: "2026-12-05" }), TODAY)).toBe("upcoming");
		expect(statusOf(sub({ startDate: TODAY }), TODAY)).toBe("active");
	});

	test("an upcoming Subscription with a pause or an end date is still upcoming", () => {
		const pause = { from: "2026-12-05", until: "2027-02-05" };
		expect(statusOf(sub({ startDate: "2026-12-05", pause }), TODAY)).toBe(
			"upcoming",
		);
		expect(
			statusOf(sub({ startDate: "2026-12-05", endDate: "2027-12-05" }), TODAY),
		).toBe("upcoming");
	});

	test("a pause that ends after today is paused", () => {
		expect(
			statusOf(
				sub({ pause: { from: "2026-11-05", until: "2027-01-05" } }),
				TODAY,
			),
		).toBe("paused");
		expect(
			statusOf(
				sub({ pause: { from: "2026-10-01", until: "2026-11-03" } }),
				TODAY,
			),
		).toBe("paused");
	});

	// AC-F05-26: a pause whose `until` is today is not paused.
	test("a pause that ends today, or before, is not paused", () => {
		expect(
			statusOf(sub({ pause: { from: "2026-10-01", until: TODAY } }), TODAY),
		).toBe("active");
		expect(
			statusOf(
				sub({ pause: { from: "2026-09-01", until: "2026-10-01" } }),
				TODAY,
			),
		).toBe("active");
	});

	test("a pause that has not started yet is paused (BR-F05-28)", () => {
		expect(
			statusOf(
				sub({ pause: { from: "2026-11-05", until: "2026-12-05" } }),
				TODAY,
			),
		).toBe("paused");
	});

	test("paused comes before ending", () => {
		expect(
			statusOf(
				sub({
					endDate: "2027-06-30",
					pause: { from: "2026-11-05", until: "2027-01-05" },
				}),
				TODAY,
			),
		).toBe("paused");
	});

	test("a stored pause that has ended falls back to ending or active", () => {
		const over = { from: "2026-09-01", until: "2026-10-01" };
		expect(statusOf(sub({ pause: over, endDate: "2027-06-30" }), TODAY)).toBe(
			"ending",
		);
		expect(statusOf(sub({ pause: over }), TODAY)).toBe("active");
	});

	test("ended comes before paused", () => {
		expect(
			statusOf(
				sub({
					endDate: "2026-10-31",
					pause: { from: "2026-10-01", until: "2027-01-05" },
				}),
				TODAY,
			),
		).toBe("ended");
	});

	test("golden: all four are active on 2 November", () => {
		for (const each of golden()) expect(statusOf(each, TODAY)).toBe("active");
	});
});

describe("divideRounded (MON-7)", () => {
	test.each([
		[0, 7, 0],
		[6, 3, 2],
		[7, 3, 2],
		[8, 3, 3],
		[5, 2, 3],
		[1, 2, 1],
		[3, 2, 2],
		[1, 3, 0],
		[2, 3, 1],
		[1, 1000, 0],
		[500, 1000, 1],
		[499, 1000, 0],
	])("%i ÷ %i rounds to %i, half away from zero", (n, d, expected) => {
		expect(divideRounded(BigInt(n), BigInt(d))).toBe(BigInt(expected));
	});

	test("stays exact beyond the safe integer range", () => {
		const big = BigInt(2) ** BigInt(70);
		expect(divideRounded(big * BigInt(3), BigInt(3))).toBe(big);
		expect(divideRounded(big * BigInt(2) + BigInt(1), BigInt(2))).toBe(
			big + BigInt(1),
		);
	});
});

describe("yearly and monthly cost (BR-F05-16, AC-F05-17)", () => {
	// golden: Subscriptions (as of 2 November).
	test.each([
		["netflix", 778800, 64900],
		["cultGym", 1800000, 150000],
		["sunrise", 21600000, 1800000],
		["amazonPrime", 149900, 12492],
	] as const)(
		"golden %s costs %i a year and %i a month",
		(name, yearly, monthly) => {
			const sub = goldenSubscription(name);
			expect(yearlyMinor(sub)).toBe(yearly);
			expect(monthlyMinor(sub)).toBe(monthly);
		},
	);

	// F05 section 5, the custom table. Amounts in minor units.
	test.each([
		[12000, { unit: "week", every: 1 }, 624000, 52000],
		[12000, { unit: "week", every: 2 }, 312000, 26000],
		[10000, { unit: "week", every: 3 }, 173333, 14444],
		[184000, { unit: "month", every: 2 }, 1104000, 92000],
		[100000, { unit: "month", every: 7 }, 171429, 14286],
		[64900, { unit: "month", every: 3 }, 259600, 21633],
		[149900, { unit: "month", every: 12 }, 149900, 12492],
		[620000, { unit: "month", every: 3 }, 2480000, 206667],
	] as [number, Cadence, number, number][])(
		"%i %j costs %i a year and %i a month",
		(amountMinor, cadence, yearly, monthly) => {
			expect(yearlyMinor({ amountMinor, cadence })).toBe(yearly);
			expect(monthlyMinor({ amountMinor, cadence })).toBe(monthly);
		},
	);

	test("rounds a half up, away from zero", () => {
		// 1 minor unit every 8 weeks: 52 ÷ 8 = 6.5 a year.
		expect(
			yearlyMinor({ amountMinor: 1, cadence: { unit: "week", every: 8 } }),
		).toBe(7);
	});

	test("rounds a third down", () => {
		expect(
			yearlyMinor({ amountMinor: 10, cadence: { unit: "week", every: 3 } }),
		).toBe(173);
	});

	// BR-F05-16: the monthly equivalent comes from the unrounded yearly cost. Rounding the
	// yearly cost first would give 18 ÷ 12 = 1.5, which rounds to 2.
	test("the monthly equivalent is taken from the unrounded yearly cost", () => {
		const subscription = {
			amountMinor: 17,
			cadence: { unit: "week", every: 50 } as Cadence,
		};
		expect((17 * 52) / 50).toBeCloseTo(17.68);
		expect(yearlyMinor(subscription)).toBe(18);
		expect(monthlyMinor(subscription)).toBe(1);
	});

	test("the most expensive Subscription still fits: 999,999,999,999 a week", () => {
		const subscription = {
			amountMinor: 999999999999,
			cadence: { unit: "week", every: 1 } as Cadence,
		};
		expect(yearlyMinor(subscription)).toBe(51999999999948);
		expect(monthlyMinor(subscription)).toBe(4333333333329);
	});

	test("the cheapest Subscription: one minor unit a year is 1 a year and 0 a month", () => {
		const subscription = {
			amountMinor: 1,
			cadence: { unit: "month", every: 12 } as Cadence,
		};
		expect(yearlyMinor(subscription)).toBe(1);
		expect(monthlyMinor(subscription)).toBe(0);
	});
});

describe("costTotals (BR-F05-17, AC-F05-17)", () => {
	// golden: 243,287.00 a year, 20,273.92 a month (243,287.00 ÷ 12 = 20,273.9166…).
	test("golden: 243,287.00 a year, 20,273.92 a month, over 4 Subscriptions", () => {
		expect(costTotals(golden())).toEqual({
			yearlyMinor: 24328700,
			monthlyMinor: 2027392,
			count: 4,
		});
	});

	test("golden Sunrise Apartments raised to 19,500.00: 261,287.00 a year, 21,773.92 a month", () => {
		const raised = golden().map((each) =>
			each.name === "Sunrise Apartments" ?
				{ ...each, amountMinor: 1950000 }
			:	each,
		);
		expect(costTotals(raised)).toEqual({
			yearlyMinor: 26128700,
			monthlyMinor: 2177392,
			count: 4,
		});
	});

	test("sums the yearly costs unrounded and rounds once", () => {
		const three = Array.from({ length: 3 }, () => ({
			amountMinor: 10000,
			cadence: { unit: "week", every: 3 } as Cadence,
		}));
		// Each is 173,333.33…: rounded one by one they would add to 519,999.
		expect(three.reduce((total, each) => total + yearlyMinor(each), 0)).toBe(
			519999,
		);
		expect(costTotals(three).yearlyMinor).toBe(520000);
		// 520,000 ÷ 12 = 43,333.33…
		expect(costTotals(three).monthlyMinor).toBe(43333);
	});

	test("the monthly total is the unrounded sum ÷ 12, not the sum of rounded months", () => {
		// Two Subscriptions of 124.92 monthly equivalent: 12,491.67 each, 12,492 rounded.
		const two = [
			{
				amountMinor: 149900,
				cadence: { unit: "month", every: 12 } as Cadence,
			},
			{
				amountMinor: 149900,
				cadence: { unit: "month", every: 12 } as Cadence,
			},
		];
		expect(two.reduce((total, each) => total + monthlyMinor(each), 0)).toBe(
			24984,
		);
		expect(costTotals(two).monthlyMinor).toBe(24983);
	});

	test("no Subscriptions cost nothing", () => {
		expect(costTotals([])).toEqual({
			yearlyMinor: 0,
			monthlyMinor: 0,
			count: 0,
		});
	});

	test("one Subscription's totals are its own figures, for every every from 1 to 52", () => {
		for (const unit of ["week", "month"] as const) {
			for (let every = 1; every <= 52; every++) {
				for (const amountMinor of [1, 99, 64900, 123457, 999999999999]) {
					const one = { amountMinor, cadence: { unit, every } as Cadence };
					expect(costTotals([one])).toEqual({
						yearlyMinor: yearlyMinor(one),
						monthlyMinor: monthlyMinor(one),
						count: 1,
					});
				}
			}
		}
	});

	test("adds Subscriptions of every cadence exactly", () => {
		// Hand-worked: 649.00 monthly 778,800 + 120.00 weekly 624,000 + 100.00 every 3 weeks
		// 173,333.33 + 1,000.00 every 7 months 171,428.57 = 1,747,561.90, so 1,747,562 a year and
		// 1,747,561.90 ÷ 12 = 145,630.16, so 145,630 a month.
		const subs = [
			{ amountMinor: 64900, cadence: { unit: "month", every: 1 } as Cadence },
			{ amountMinor: 12000, cadence: { unit: "week", every: 1 } as Cadence },
			{ amountMinor: 10000, cadence: { unit: "week", every: 3 } as Cadence },
			{ amountMinor: 100000, cadence: { unit: "month", every: 7 } as Cadence },
		];
		expect(costTotals(subs)).toEqual({
			yearlyMinor: 1747562,
			monthlyMinor: 145630,
			count: 4,
		});
	});

	test("does not depend on the order of the Subscriptions", () => {
		const forward = golden();
		expect(costTotals([...forward].reverse())).toEqual(costTotals(forward));
	});

	test("100 of the largest Subscriptions still fit; 200 do not", () => {
		const largest = {
			amountMinor: 999999999999,
			cadence: { unit: "week", every: 1 } as Cadence,
		};
		expect(
			costTotals(Array.from({ length: 100 }, () => largest)).yearlyMinor,
		).toBe(5199999999994800);
		expect(() => costTotals(Array.from({ length: 200 }, () => largest))).toThrow(
			RangeError,
		);
	});
});

describe("nextDueOf (BR-F05-19)", () => {
	test.each([
		["netflix", "2026-11-05"],
		["cultGym", "2026-11-10"],
		["sunrise", "2026-12-01"],
		["amazonPrime", "2027-10-12"],
	] as const)("golden %s is %s", (name, expected) => {
		expect(
			nextDueOf(
				{ ...goldenSubscription(name), note: null, demo: false },
				TODAY,
			),
		).toBe(expected);
	});

	test("reads the charges and tombstones the Subscription carries", () => {
		expect(nextDueOf(dated({ skipped: ["2026-11-05"] }), TODAY)).toBe(
			"2026-12-05",
		);
		expect(
			nextDueOf(
				dated({ charged: ["2026-09-05", "2026-10-05", "2026-11-05"] }),
				TODAY,
			),
		).toBe("2026-12-05");
	});
});

describe("upcomingCharges (BR-F05-20, AC-F05-02)", () => {
	// golden: next 30 days, 2 November to 2 December inclusive.
	test("golden: Netflix 5 Nov, Cult Gym 10 Nov, Sunrise Apartments 1 Dec, 20,149.00", () => {
		const entries = upcomingCharges(golden(), TODAY, 30);
		expect(entries.map((entry) => [entry.dueOn, entry.amountMinor])).toEqual([
			["2026-11-05", 64900],
			["2026-11-10", 150000],
			["2026-12-01", 1800000],
		]);
		expect(entries.map((entry) => entry.subscriptionId)).toEqual([
			goldenSubscription("netflix").id,
			goldenSubscription("cultGym").id,
			goldenSubscription("sunrise").id,
		]);
		expect(upcomingTotal(entries)).toBe(2014900);
	});

	// golden: renewals within 7 days, 2 to 9 November: Netflix only.
	test("golden: within 7 days is Netflix only; Cult Gym on 10 November is just outside", () => {
		const entries = upcomingCharges(golden(), TODAY, 7);
		expect(entries).toEqual([
			{
				subscriptionId: goldenSubscription("netflix").id,
				dueOn: "2026-11-05",
				amountMinor: 64900,
			},
		]);
	});

	test("an entry is {subscriptionId, dueOn, amountMinor} and nothing else", () => {
		const [entry] = upcomingCharges(golden(), TODAY, 30);
		expect(Object.keys(entry as object).sort()).toEqual([
			"amountMinor",
			"dueOn",
			"subscriptionId",
		]);
	});

	test("the window includes today and today + days, and excludes the day after", () => {
		const sub = dated({ charged: [] });
		expect(upcomingCharges([sub], "2026-11-05", 0).map((e) => e.dueOn)).toEqual([
			"2026-11-05",
		]);
		expect(upcomingCharges([sub], "2026-11-04", 1).map((e) => e.dueOn)).toEqual([
			"2026-11-05",
		]);
		expect(upcomingCharges([sub], "2026-11-03", 1).map((e) => e.dueOn)).toEqual(
			[],
		);
		expect(upcomingCharges([sub], "2026-11-06", 30).map((e) => e.dueOn)).toEqual(
			["2026-12-05"],
		);
	});

	test("a date already charged is left out, a date due today with no charge yet is not", () => {
		const sub = dated({ charged: ["2026-09-05", "2026-10-05", "2026-11-05"] });
		expect(upcomingCharges([sub], "2026-11-05", 30).map((e) => e.dueOn)).toEqual(
			["2026-12-05"],
		);
		expect(
			upcomingCharges([dated()], "2026-11-05", 30).map((e) => e.dueOn),
		).toEqual(["2026-11-05", "2026-12-05"]);
	});

	// golden: skipping Netflix's 5 November leaves 19,500.00.
	test("golden: a skipped Netflix 5 November leaves 19,500.00", () => {
		const subs = golden().map((each) =>
			each.name === "Netflix" ? { ...each, skipped: ["2026-11-05"] } : each,
		);
		const entries = upcomingCharges(subs, TODAY, 30);
		expect(entries.map((entry) => entry.dueOn)).toEqual([
			"2026-11-10",
			"2026-12-01",
		]);
		expect(upcomingTotal(entries)).toBe(1950000);
	});

	// golden: a paused Netflix, 5 Nov to 5 Jan, also leaves 19,500.00.
	test("golden: a paused Netflix leaves 19,500.00, and its next charge is 5 January", () => {
		const subs = golden().map((each) =>
			each.name === "Netflix" ?
				{ ...each, pause: { from: "2026-11-05", until: "2027-01-05" } }
			:	each,
		);
		expect(upcomingTotal(upcomingCharges(subs, TODAY, 30))).toBe(1950000);
		expect(
			upcomingCharges(subs, "2026-12-30", 10).map((entry) => [
				entry.subscriptionId,
				entry.dueOn,
			]),
		).toContainEqual([goldenSubscription("netflix").id, "2027-01-05"]);
	});

	test("an ended Subscription adds nothing, even when its end date is today", () => {
		const unchargedToday = dated({
			charged: ["2026-09-05", "2026-10-05"],
			endDate: "2026-11-05",
		});
		expect(upcomingCharges([unchargedToday], "2026-11-05", 30)).toEqual([]);
		expect(
			upcomingCharges([dated({ endDate: "2026-10-20" })], "2026-11-02", 30),
		).toEqual([]);
	});

	test("an ending Subscription lists its dates up to its end date, inclusive", () => {
		const sub = dated({ endDate: "2026-12-05" });
		expect(upcomingCharges([sub], "2026-11-02", 90).map((e) => e.dueOn)).toEqual(
			["2026-11-05", "2026-12-05"],
		);
	});

	test("an upcoming Subscription appears from its start date", () => {
		const sub = dated({
			startDate: "2026-11-20",
			chargesFrom: "2026-11-20",
			charged: [],
		});
		expect(upcomingCharges([sub], "2026-11-02", 30).map((e) => e.dueOn)).toEqual(
			["2026-11-20"],
		);
		expect(upcomingCharges([sub], "2026-11-02", 7)).toEqual([]);
	});

	test("a weekly Subscription appears up to five times in 30 days", () => {
		const weekly = dated({
			startDate: "2026-10-01",
			chargesFrom: "2026-10-01",
			cadence: { unit: "week", every: 1 },
			charged: [],
		});
		expect(
			upcomingCharges([weekly], "2026-11-05", 30).map((e) => e.dueOn),
		).toEqual([
			"2026-11-05",
			"2026-11-12",
			"2026-11-19",
			"2026-11-26",
			"2026-12-03",
		]);
		expect(upcomingCharges([weekly], "2026-11-02", 30)).toHaveLength(4);
	});

	test("sorts by date, then by name without regard to case, then by id", () => {
		const base = { charged: [], skipped: [] };
		const entries = upcomingCharges(
			[
				dated({
					...base,
					id: "0199a000-0000-7000-8002-00000000000b",
					name: "zeta",
				}),
				dated({
					...base,
					id: "0199a000-0000-7000-8002-00000000000a",
					name: "alpha",
				}),
				dated({
					...base,
					id: "0199a000-0000-7000-8002-00000000000c",
					name: "Alpha",
				}),
				dated({
					...base,
					id: "0199a000-0000-7000-8002-00000000000d",
					name: "Beta",
					startDate: "2026-11-04",
					chargesFrom: "2026-11-04",
				}),
			],
			"2026-11-02",
			30,
		);
		expect(entries.map((e) => [e.dueOn, e.subscriptionId.slice(-1)])).toEqual([
			["2026-11-04", "d"],
			["2026-11-05", "a"],
			["2026-11-05", "c"],
			["2026-11-05", "b"],
		]);
	});

	test("a Subscription with a pause in the past is not paused any more", () => {
		const sub = dated({
			pause: { from: "2026-09-20", until: "2026-10-20" },
			charged: [],
		});
		expect(upcomingCharges([sub], "2026-11-02", 30).map((e) => e.dueOn)).toEqual(
			["2026-11-05"],
		);
	});

	test("no Subscriptions give an empty list and a total of 0", () => {
		expect(upcomingCharges([], TODAY, 30)).toEqual([]);
		expect(upcomingTotal([])).toBe(0);
	});

	test("the current amount is used, whatever the old charges were", () => {
		expect(
			upcomingCharges([dated({ amountMinor: 79900 })], "2026-11-02", 5)[0]
				?.amountMinor,
		).toBe(79900);
	});
});

describe("dueInMonth and expectedMinor (BR-F05-18, BR-F05-36, AC-F05-24)", () => {
	// golden: November 2,149.00 still to come, December expects 20,149.00, October none.
	test.each([
		["2026-10", 0],
		["2026-11", 214900],
		["2026-12", 2014900],
	])("golden %s expects %i", (month, expected) => {
		expect(expectedMinor(golden(), month, TODAY)).toBe(expected);
	});

	test("golden November's dates: Netflix 5 Nov and Cult Gym 10 Nov", () => {
		const dates = golden().map((each) => [
			each.name,
			dueInMonth(each, "2026-11", TODAY),
		]);
		expect(dates).toEqual([
			["Sunrise Apartments", []],
			["Netflix", ["2026-11-05"]],
			["Cult Gym", ["2026-11-10"]],
			["Amazon Prime", []],
		]);
	});

	test("a month in 2027 adds up all four Subscriptions: Oct 2027 holds Amazon Prime too", () => {
		expect(expectedMinor(golden(), "2027-10", TODAY)).toBe(
			64900 + 150000 + 1800000 + 149900,
		);
	});

	test("a past month is empty even with dates in it", () => {
		expect(dueInMonth(dated({ charged: [] }), "2026-10", TODAY)).toEqual([]);
	});

	test("includes today and leaves out earlier days of the same month", () => {
		const sub = dated({ charged: [] });
		expect(dueInMonth(sub, "2026-11", "2026-11-05")).toEqual(["2026-11-05"]);
		expect(dueInMonth(sub, "2026-11", "2026-11-06")).toEqual([]);
	});

	test("leaves out charged, skipped and paused dates", () => {
		expect(
			dueInMonth(dated({ charged: ["2026-11-05"] }), "2026-11", TODAY),
		).toEqual([]);
		expect(
			dueInMonth(dated({ skipped: ["2026-11-05"] }), "2026-11", TODAY),
		).toEqual([]);
		expect(
			dueInMonth(
				dated({ pause: { from: "2026-11-05", until: "2026-12-05" } }),
				"2026-11",
				TODAY,
			),
		).toEqual([]);
	});

	test("respects chargesFrom and the end date", () => {
		expect(
			dueInMonth(dated({ chargesFrom: "2026-12-01" }), "2026-11", TODAY),
		).toEqual([]);
		expect(
			dueInMonth(dated({ endDate: "2026-11-04" }), "2026-11", TODAY),
		).toEqual([]);
		expect(
			dueInMonth(dated({ endDate: "2026-11-05" }), "2026-11", TODAY),
		).toEqual(["2026-11-05"]);
	});

	test("a weekly Subscription has several dates in a month", () => {
		const weekly = dated({
			startDate: "2026-10-01",
			chargesFrom: "2026-10-01",
			cadence: { unit: "week", every: 1 },
			charged: [],
		});
		expect(dueInMonth(weekly, "2026-11", "2026-11-02")).toEqual([
			"2026-11-05",
			"2026-11-12",
			"2026-11-19",
			"2026-11-26",
		]);
	});

	test("February in a leap year holds the 29th", () => {
		const sub = dated({
			startDate: "2028-01-29",
			chargesFrom: "2028-01-29",
			charged: [],
		});
		expect(dueInMonth(sub, "2028-02", "2028-02-01")).toEqual(["2028-02-29"]);
		expect(
			dueInMonth(
				{ ...sub, startDate: "2027-01-29", chargesFrom: "2027-01-29" },
				"2027-02",
				"2027-02-01",
			),
		).toEqual(["2027-02-28"]);
	});

	test("no Subscriptions expect nothing", () => {
		expect(expectedMinor([], "2026-11", TODAY)).toBe(0);
	});
});

describe("monthItems and monthTotals (BR-F05-38, AC-F05-24)", () => {
	const charges = (): MonthCharge[] =>
		GOLDEN_ALL.filter((row) => row.source === "subscription").map((row) => ({
			id: row.id,
			subscriptionId: row.subscriptionId,
			occurredOn: row.occurredOn,
			payee: row.payee as string,
			category: row.category as string,
			amountMinor: row.amountMinor,
		}));

	// golden: check E, October charges 20,148.00, with Cult Gym's 10 October skipped; November
	// charged 18,000.00 (#27), still to come 2,149.00.
	test.each([
		[
			"golden October: three charges and Cult Gym's skipped date, charged 20,148.00",
			"2026-10",
			[
				["2026-10-01", "charged", "Sunrise Apartments", 1800000],
				["2026-10-05", "charged", "Netflix", 64900],
				["2026-10-10", "skipped", "Cult Gym", 150000],
				["2026-10-12", "charged", "Amazon Prime", 149900],
			],
			{ chargedMinor: 2014800, toComeMinor: 0 },
		],
		[
			"golden November: #27 charged, Netflix and Cult Gym due",
			"2026-11",
			[
				["2026-11-01", "charged", "Sunrise Apartments", 1800000],
				["2026-11-05", "due", "Netflix", 64900],
				["2026-11-10", "due", "Cult Gym", 150000],
			],
			{ chargedMinor: 1800000, toComeMinor: 214900 },
		],
	])("%s", (_title, month, expected, totals) => {
		const items = monthItems(golden(), charges(), month, TODAY);
		expect(
			items.map((item) => [item.date, item.kind, item.name, item.amountMinor]),
		).toEqual(expected);
		expect(monthTotals(items)).toEqual(totals);
	});

	// golden: December expects 20,149.00.
	test("golden December: three due items, 20,149.00", () => {
		const items = monthItems(golden(), charges(), "2026-12", TODAY);
		expect(
			items.map((item) => [item.date, item.kind, item.amountMinor]),
		).toEqual([
			["2026-12-01", "due", 1800000],
			["2026-12-05", "due", 64900],
			["2026-12-10", "due", 150000],
		]);
		expect(monthTotals(items)).toEqual({
			chargedMinor: 0,
			toComeMinor: 2014900,
		});
	});

	test("agrees with expectedMinor on what is still to come", () => {
		for (const month of ["2026-11", "2026-12", "2027-03", "2027-10"]) {
			expect(
				monthTotals(monthItems(golden(), charges(), month, TODAY))
					.toComeMinor,
			).toBe(expectedMinor(golden(), month, TODAY));
		}
	});

	test("a charged item carries its Transaction id, a due item none", () => {
		const items = monthItems(golden(), charges(), "2026-11", TODAY);
		expect(items[0]?.chargeId).toBe(
			GOLDEN_ALL.find((row) => row.golden === 27)?.id,
		);
		expect(items[1]?.chargeId).toBeNull();
		expect(items[0]?.subscriptionId).toBe(goldenSubscription("sunrise").id);
	});

	test("a charge of a deleted Subscription shows under its payee, with no Subscription", () => {
		const orphan: MonthCharge = {
			id: "c1",
			subscriptionId: null,
			occurredOn: "2026-10-05",
			payee: "Netflix",
			category: "entertainment",
			amountMinor: 64900,
		};
		const items = monthItems([], [orphan], "2026-10", TODAY);
		expect(items).toEqual([
			{
				date: "2026-10-05",
				kind: "charged",
				subscriptionId: null,
				name: "Netflix",
				category: "entertainment",
				amountMinor: 64900,
				chargeId: "c1",
			},
		]);
	});

	test("a charge keeps its own payee and amount, though the Subscription was renamed and repriced", () => {
		const renamed = golden().map((each) =>
			each.name === "Netflix" ?
				{ ...each, name: "Netflix Premium", amountMinor: 79900 }
			:	each,
		);
		const october = monthItems(renamed, charges(), "2026-10", TODAY);
		const netflix = october.find((item) => item.date === "2026-10-05");
		expect(netflix).toMatchObject({
			kind: "charged",
			name: "Netflix Premium",
			amountMinor: 64900,
		});
	});

	test("charges of other months are ignored", () => {
		expect(monthItems([], charges(), "2026-08", TODAY)).toEqual([]);
		const items = monthItems(golden(), charges(), "2026-10", TODAY);
		expect(items.every((item) => item.date.startsWith("2026-10"))).toBe(true);
	});

	test("a due date with a charge is shown once, as charged", () => {
		const items = monthItems(
			[dated({ charged: [] })],
			[
				{
					id: "c2",
					subscriptionId: dated().id,
					occurredOn: "2026-11-05",
					payee: "Netflix",
					category: "entertainment",
					amountMinor: 64900,
				},
			],
			"2026-11",
			TODAY,
		);
		expect(items.map((item) => item.kind)).toEqual(["charged"]);
	});

	test("a skipped date from today on is skipped, not due", () => {
		const items = monthItems(
			[dated({ charged: [], skipped: ["2026-11-05"] })],
			[],
			"2026-11",
			TODAY,
		);
		expect(items.map((item) => [item.date, item.kind])).toEqual([
			["2026-11-05", "skipped"],
		]);
		expect(monthTotals(items)).toEqual({ chargedMinor: 0, toComeMinor: 0 });
	});

	test("paused due dates from today on are paused and count for nothing", () => {
		const sub = dated({
			charged: [],
			pause: { from: "2026-11-05", until: "2027-01-05" },
		});
		const november = monthItems([sub], [], "2026-11", TODAY);
		expect(november.map((item) => [item.date, item.kind])).toEqual([
			["2026-11-05", "paused"],
		]);
		expect(monthTotals(november)).toEqual({ chargedMinor: 0, toComeMinor: 0 });
		expect(
			monthItems([sub], [], "2027-01", TODAY).map((item) => [
				item.date,
				item.kind,
			]),
		).toEqual([["2027-01-05", "due"]]);
	});

	test("a paused date in the past shows nothing: it was neither charged nor skipped", () => {
		const sub = dated({
			charged: [],
			pause: { from: "2026-09-20", until: "2026-10-20" },
		});
		expect(monthItems([sub], [], "2026-10", TODAY)).toEqual([]);
	});

	test("a paused date that was also skipped shows as skipped", () => {
		const sub = dated({
			charged: [],
			skipped: ["2026-11-05"],
			pause: { from: "2026-11-05", until: "2027-01-05" },
		});
		expect(
			monthItems([sub], [], "2026-11", TODAY).map((item) => item.kind),
		).toEqual(["skipped"]);
	});

	test("a date due today with no charge yet is due, and one paused today is paused", () => {
		const today = "2026-11-05";
		expect(
			monthItems([dated({ charged: [] })], [], "2026-11", today).map(
				(item) => [item.date, item.kind],
			),
		).toEqual([["2026-11-05", "due"]]);
		const paused = dated({
			charged: [],
			pause: { from: "2026-11-05", until: "2026-12-05" },
		});
		expect(
			monthItems([paused], [], "2026-11", today).map((item) => [
				item.date,
				item.kind,
			]),
		).toEqual([["2026-11-05", "paused"]]);
		// The day before, the same dates are still ahead, so they read the same.
		expect(
			monthItems([paused], [], "2026-11", "2026-11-04").map(
				(item) => item.kind,
			),
		).toEqual(["paused"]);
		// The day after, they are behind: nothing shows for a date that was neither charged nor skipped.
		expect(monthItems([paused], [], "2026-11", "2026-11-06")).toEqual([]);
		expect(
			monthItems([dated({ charged: [] })], [], "2026-11", "2026-11-06"),
		).toEqual([]);
	});

	test("a pending Subscription's dates are pending and left out of the totals", () => {
		const sub = { ...dated({ charged: [] }), pending: true };
		const items = monthItems([sub], [], "2026-11", TODAY);
		expect(items.map((item) => item.kind)).toEqual(["pending"]);
		expect(monthTotals(items)).toEqual({ chargedMinor: 0, toComeMinor: 0 });
	});

	test("tombstoned dates before chargesFrom or after the end date are not shown", () => {
		const before = dated({ chargesFrom: "2026-11-01", skipped: ["2026-10-05"] });
		expect(monthItems([before], [], "2026-10", TODAY)).toEqual([]);
		const after = dated({ endDate: "2026-10-31", skipped: ["2026-11-05"] });
		expect(monthItems([after], [], "2026-11", TODAY)).toEqual([]);
	});

	test("an ended Subscription's past skipped dates still show", () => {
		const ended = dated({
			endDate: "2026-10-31",
			charged: ["2026-09-05"],
			skipped: ["2026-10-05"],
		});
		expect(
			monthItems([ended], [], "2026-10", TODAY).map((item) => item.kind),
		).toEqual(["skipped"]);
	});

	test("sorts by date, then amount largest first, then name", () => {
		const subs = [
			dated({
				id: "0199a000-0000-7000-8002-00000000000a",
				name: "b",
				amountMinor: 100,
				charged: [],
			}),
			dated({
				id: "0199a000-0000-7000-8002-00000000000b",
				name: "a",
				amountMinor: 100,
				charged: [],
			}),
			dated({
				id: "0199a000-0000-7000-8002-00000000000c",
				name: "c",
				amountMinor: 500,
				charged: [],
			}),
		];
		expect(
			monthItems(subs, [], "2026-11", TODAY).map((item) => item.name),
		).toEqual(["c", "a", "b"]);
	});

	test("items that tie on date, amount and name fall back to the Transaction id, due items first", () => {
		const charge = (id: string): MonthCharge => ({
			id,
			subscriptionId: null,
			occurredOn: "2026-11-05",
			payee: "Netflix",
			category: "entertainment",
			amountMinor: 64900,
		});
		const due = dated({ charged: [], name: "Netflix" });
		const items = monthItems(
			[due],
			[charge("c-b"), charge("c-a")],
			"2026-11",
			TODAY,
		);
		expect(items.map((item) => [item.kind, item.chargeId])).toEqual([
			["due", null],
			["charged", "c-a"],
			["charged", "c-b"],
		]);
	});

	test("a weekly Subscription shows each date of the month", () => {
		const weekly = dated({
			startDate: "2026-10-01",
			chargesFrom: "2026-10-01",
			cadence: { unit: "week", every: 1 },
			charged: [],
		});
		const items = monthItems([weekly], [], "2026-11", TODAY);
		expect(items.map((item) => item.date)).toEqual([
			"2026-11-05",
			"2026-11-12",
			"2026-11-19",
			"2026-11-26",
		]);
	});

	test("the last day of a month and the first of the next stay in their own months", () => {
		const sub = dated({
			startDate: "2026-10-31",
			chargesFrom: "2026-10-31",
			cadence: { unit: "week", every: 1 },
			charged: [],
		});
		expect(
			monthItems([sub], [], "2026-11", "2026-10-01").map((item) => item.date),
		).toEqual(["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"]);
		expect(
			monthItems([sub], [], "2026-10", "2026-10-01").map((item) => item.date),
		).toEqual(["2026-10-31"]);
	});

	test("no Subscriptions and no charges give nothing", () => {
		expect(monthItems([], [], "2026-11", TODAY)).toEqual([]);
		expect(monthTotals([])).toEqual({ chargedMinor: 0, toComeMinor: 0 });
	});
});
