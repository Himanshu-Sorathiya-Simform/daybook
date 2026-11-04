import { describe, expect, test } from "vitest";

import { CATEGORY_KEYS, DATE_PRESETS, TXN_TYPES } from "@/lib/transactions/model";
import type { TransactionFilter } from "@/lib/transactions/url";

import {
	activeChips,
	amountLabel,
	choiceSummary,
	dateLabel,
	FILTER_TYPES,
	type FilterLocale,
	PRESET_LABELS,
	presetOfFilter,
	quickRangeLabel,
	sameBounds,
	SOURCE_LABELS,
	TYPE_LABELS,
} from "../filter-labels";
import type { QuickRange } from "../quick-ranges";

/** Golden's profile on the golden clock (IN, INR). */
const IN: FilterLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};
const DE: FilterLocale = {
	today: "2026-11-02",
	dateLocale: "de-DE",
	numberLocale: "de-DE-u-nu-latn",
	currency: "EUR",
};

/** Check B's quick ranges (F03 section 5). */
const CHECK_B: QuickRange[] = [
	{ maxMinor: 39999, count: 1 },
	{ minMinor: 40000, maxMinor: 79999, count: 1 },
	{ minMinor: 80000, maxMinor: 249999, count: 1 },
	{ minMinor: 250000, count: 1 },
];

describe("names", () => {
	test("the Type filter offers Expense, Income and Refund until M2 adds Goals", () => {
		expect(FILTER_TYPES.map((type) => TYPE_LABELS[type])).toEqual([
			"Expense",
			"Income",
			"Refund",
		]);
	});

	test("every type has a name, the Goal types as the entry dialog writes them", () => {
		expect(TXN_TYPES.map((type) => TYPE_LABELS[type])).toEqual([
			"Income",
			"Expense",
			"Refund",
			"To Goal",
			"From Goal",
		]);
	});

	test("every date preset has its name, in section 3's order", () => {
		expect(DATE_PRESETS.map((preset) => PRESET_LABELS[preset])).toEqual([
			"All time",
			"This month",
			"Last month",
			"Last 3 months",
			"Year to date",
			"Last 12 months",
			"Custom range",
		]);
	});

	test("the sources read as the More control writes them (BR-F03-39)", () => {
		expect(SOURCE_LABELS).toEqual({
			any: "Any source",
			manual: "Added by you",
			subscription: "Subscription charges",
		});
	});
});

describe("presetOfFilter and dateLabel", () => {
	test.each([
		[{}, "all", "All time"],
		[{ from: "2026-11-01", to: "2026-11-30" }, "this_month", "This month"],
		[{ from: "2026-10-01", to: "2026-10-31" }, "last_month", "Last month"],
		[{ from: "2026-09-01", to: "2026-11-30" }, "last_3_months", "Last 3 months"],
		[{ from: "2026-01-01", to: "2026-11-02" }, "year_to_date", "Year to date"],
		[
			{ from: "2025-12-01", to: "2026-11-30" },
			"last_12_months",
			"Last 12 months",
		],
	] as [TransactionFilter, string, string][])(
		"%j on 2 Nov is %s, read %j",
		(filter, preset, label) => {
			expect(presetOfFilter(filter, IN.today)).toBe(preset);
			expect(dateLabel(filter, IN)).toBe(label);
		},
	);

	test("a custom range reads its two days in F02's short date", () => {
		const filter = { from: "2026-10-05", to: "2026-10-20" };
		expect(presetOfFilter(filter, IN.today)).toBe("custom");
		expect(dateLabel(filter, IN)).toBe("5 Oct to 20 Oct");
	});

	test("a custom range adds the year to a day outside the current year", () => {
		expect(dateLabel({ from: "2025-12-20", to: "2026-01-05" }, IN)).toBe(
			"20 Dec 2025 to 5 Jan",
		);
	});

	test("a custom range reads in the profile's date locale", () => {
		expect(dateLabel({ from: "2026-10-05", to: "2026-10-20" }, DE)).toBe(
			"5. Okt. to 20. Okt.",
		);
	});

	test("last month's dates are custom once the month has moved on", () => {
		expect(
			dateLabel(
				{ from: "2026-10-01", to: "2026-10-31" },
				{
					...IN,
					today: "2026-12-01",
				},
			),
		).toBe("1 Oct to 31 Oct");
	});
});

describe("quickRangeLabel (BR-F03-74)", () => {
	test("check B's ranges read as section 5 writes them", () => {
		expect(CHECK_B.map((range) => quickRangeLabel(range, IN))).toEqual([
			"Under ₹400",
			"₹400 to ₹800",
			"₹800 to ₹2,500",
			"₹2,500 and over",
		]);
	});

	test("an edge with a fractional part keeps its decimals", () => {
		expect(quickRangeLabel({ minMinor: 150, maxMinor: 249 }, IN)).toBe(
			"₹1.50 to ₹2.50",
		);
		expect(quickRangeLabel({ maxMinor: 4 }, IN)).toBe("Under ₹0.05");
	});

	test("reads in the user's number format", () => {
		expect(quickRangeLabel({ minMinor: 10000000 }, IN)).toBe(
			"₹1,00,000 and over",
		);
		expect(quickRangeLabel({ minMinor: 124000, maxMinor: 249999 }, DE)).toBe(
			"1.240 € to 2.500 €",
		);
	});
});

describe("amountLabel (BR-F03-39)", () => {
	test("no bounds have no label", () => {
		expect(amountLabel({}, IN)).toBeNull();
	});

	test("both bounds read from one to the other", () => {
		expect(amountLabel({ minMinor: 100000, maxMinor: 250000 }, IN)).toBe(
			"₹1,000 to ₹2,500",
		);
	});

	test("a min alone reads From", () => {
		expect(amountLabel({ minMinor: 100000 }, IN)).toBe("From ₹1,000");
	});

	test("a max alone reads Up to", () => {
		expect(amountLabel({ maxMinor: 250000 }, IN)).toBe("Up to ₹2,500");
	});

	test("decimals show only when an amount has a fractional part", () => {
		expect(amountLabel({ minMinor: 100050, maxMinor: 249999 }, IN)).toBe(
			"₹1,000.50 to ₹2,499.99",
		);
	});

	test("bounds equal to a quick range take the range's own name", () => {
		expect(amountLabel({ maxMinor: 39999 }, IN, CHECK_B)).toBe("Under ₹400");
		expect(amountLabel({ minMinor: 40000, maxMinor: 79999 }, IN, CHECK_B)).toBe(
			"₹400 to ₹800",
		);
		expect(amountLabel({ minMinor: 250000 }, IN, CHECK_B)).toBe(
			"₹2,500 and over",
		);
	});

	test("without the quick ranges the same bounds read as themselves", () => {
		expect(amountLabel({ maxMinor: 39999 }, IN)).toBe("Up to ₹399.99");
	});

	test("bounds near a quick range but not equal read as themselves", () => {
		expect(amountLabel({ minMinor: 40000, maxMinor: 80000 }, IN, CHECK_B)).toBe(
			"₹400 to ₹800",
		);
		expect(amountLabel({ minMinor: 40000 }, IN, CHECK_B)).toBe("From ₹400");
	});
});

describe("sameBounds", () => {
	test("matches only the same min and the same max, an absent one included", () => {
		expect(sameBounds({}, {})).toBe(true);
		expect(sameBounds({ minMinor: 1 }, { minMinor: 1 })).toBe(true);
		expect(sameBounds({ minMinor: 1 }, { minMinor: 1, maxMinor: 5 })).toBe(
			false,
		);
		expect(sameBounds({ maxMinor: 5 }, { minMinor: 5 })).toBe(false);
	});
});

describe("choiceSummary", () => {
	const label = (type: (typeof FILTER_TYPES)[number]) => TYPE_LABELS[type];

	test("reads Any with nothing chosen", () => {
		expect(choiceSummary(undefined, label)).toBe("Any");
		expect(choiceSummary([], label)).toBe("Any");
	});

	test("reads the one chosen option's name", () => {
		expect(choiceSummary(["refund"], label)).toBe("Refund");
	});

	test("reads how many are chosen when there are several", () => {
		expect(choiceSummary(["expense", "refund"], label)).toBe("2");
	});
});

describe("activeChips (BR-F03-39)", () => {
	test("no filter has no chips", () => {
		expect(activeChips({}, IN)).toEqual([]);
	});

	test("check B reads Last month, then Food", () => {
		const chips = activeChips(
			{ from: "2026-10-01", to: "2026-10-31", cat: ["food"] },
			IN,
		);
		expect(chips.map((chip) => chip.label)).toEqual(["Last month", "Food"]);
	});

	test("orders the chips as the controls are ordered", () => {
		const chips = activeChips(
			{
				from: "2026-10-05",
				to: "2026-10-20",
				type: ["expense", "refund"],
				cat: ["food", "shopping"],
				goal: "0192e0c1-0000-7000-8000-000000000001",
				sub: "0192e0c1-0000-7000-8000-000000000002",
				src: "manual",
				minMinor: 100000,
				q: "swiggy",
			},
			IN,
		);
		expect(chips.map((chip) => [chip.id, chip.label])).toEqual([
			["date", "5 Oct to 20 Oct"],
			["type:expense", "Expense"],
			["type:refund", "Refund"],
			["cat:food", "Food"],
			["cat:shopping", "Shopping"],
			["amount", "From ₹1,000"],
			["src", "Added by you"],
			["sub", "Subscription charges"],
			["goal", "Goal"],
			["q", "“swiggy”"],
		]);
	});

	test("removing the date drops both days and keeps everything else", () => {
		const [date] = activeChips(
			{ from: "2026-10-01", to: "2026-10-31", cat: ["food"] },
			IN,
		);
		expect(date!.without).toEqual({ cat: ["food"] });
	});

	test("removing one of two types keeps the other", () => {
		const chips = activeChips({ type: ["expense", "refund"], q: "uber" }, IN);
		expect(chips[0]!.without).toEqual({ type: ["refund"], q: "uber" });
		expect(chips[1]!.without).toEqual({ type: ["expense"], q: "uber" });
	});

	test("removing the last type drops the list rather than leaving it empty", () => {
		const [type] = activeChips({ type: ["income"] }, IN);
		expect(type!.without).toEqual({});
	});

	test("removing one of two categories keeps the other, and the last drops the list", () => {
		const chips = activeChips({ cat: ["food", "health"] }, IN);
		expect(chips[0]!.without).toEqual({ cat: ["health"] });
		expect(activeChips({ cat: ["health"] }, IN)[0]!.without).toEqual({});
	});

	test("one amount chip covers both bounds, and removing it drops both", () => {
		const chips = activeChips(
			{ minMinor: 100000, maxMinor: 250000, src: "manual" },
			IN,
		);
		expect(chips.map((chip) => chip.label)).toEqual([
			"₹1,000 to ₹2,500",
			"Added by you",
		]);
		expect(chips[0]!.without).toEqual({ src: "manual" });
	});

	test("the amount chip takes a quick range's name when one is given", () => {
		const [amount] = activeChips(
			{ minMinor: 80000, maxMinor: 249999 },
			IN,
			CHECK_B,
		);
		expect(amount!.label).toBe("₹800 to ₹2,500");
	});

	test("each other chip removes only its own field", () => {
		const filter: TransactionFilter = {
			src: "subscription",
			sub: "0192e0c1-0000-7000-8000-000000000002",
			goal: "0192e0c1-0000-7000-8000-000000000001",
			q: "50%",
		};
		const chips = activeChips(filter, IN);
		expect(chips.map((chip) => chip.label)).toEqual([
			"Subscription charges",
			"Subscription charges",
			"Goal",
			"“50%”",
		]);
		const sub = "0192e0c1-0000-7000-8000-000000000002";
		const goal = "0192e0c1-0000-7000-8000-000000000001";
		expect(chips.map((chip) => chip.without)).toEqual([
			{ sub, goal, q: "50%" },
			{ src: "subscription", goal, q: "50%" },
			{ src: "subscription", sub, q: "50%" },
			{ src: "subscription", sub, goal },
		]);
	});

	test("never changes the filter it reads", () => {
		const filter: TransactionFilter = {
			from: "2026-10-01",
			to: "2026-10-31",
			type: ["expense", "refund"],
			cat: ["food"],
			minMinor: 1,
		};
		const copy = structuredClone(filter);
		activeChips(filter, IN);
		expect(filter).toEqual(copy);
	});

	test("every category has a chip under its own name", () => {
		const chips = activeChips({ cat: [...CATEGORY_KEYS] }, IN);
		expect(chips).toHaveLength(CATEGORY_KEYS.length);
		expect(chips.every((chip) => chip.label.length > 0)).toBe(true);
		expect(chips.find((chip) => chip.id === "cat:food")!.label).toBe("Food");
	});
});
