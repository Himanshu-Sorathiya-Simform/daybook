import { describe, expect, test } from "vitest";

import type { Formats } from "../labels";
import {
	DEFAULT_SORT,
	sortTableRows,
	STATUS_LABELS,
	TABLE_CAPTION,
	TABLE_COLUMNS,
	type TableColumn,
	tableRows,
	tableTotal,
} from "../table";
import type { SubscriptionList } from "../types";
import { subscriptionItem } from "./fixtures";

const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

// AC-F05-02: golden's totals, 20,273.92 a month and 243,287.00 a year over 4 Subscriptions.
const TOTALS = { monthlyMinor: 2027392, yearlyMinor: 24328700, count: 4 };

const golden = () => [
	subscriptionItem("netflix"),
	subscriptionItem("amazonPrime"),
	subscriptionItem("sunrise"),
	subscriptionItem("cultGym"),
];
const list = (items = golden(), totals: SubscriptionList["totals"] = TOTALS) => ({
	items,
	totals,
});

let n = 0;
const extra = (
	name: string,
	changes: Parameters<typeof subscriptionItem>[1] = {},
) => {
	n += 1;
	return subscriptionItem("netflix", {
		id: `0192f0c4-7a1e-7c3b-9d2a-${String(n).padStart(12, "0")}`,
		name,
		...changes,
	});
};

const order = (
	rows: ReturnType<typeof tableRows>,
	column: TableColumn,
	direction: "asc" | "desc",
) => sortTableRows(rows, { column, direction }).map((row) => row.name);

describe("the columns and the default sort (BR-F05-39)", () => {
	test("the eight columns, in order", () => {
		expect(TABLE_COLUMNS.map((column) => column.label)).toEqual([
			"Name",
			"Category",
			"Price",
			"Per month",
			"Share",
			"Per year",
			"Next due",
			"Status",
		]);
		expect(TABLE_COLUMNS.map((column) => column.id)).toEqual([
			"name",
			"category",
			"price",
			"perMonth",
			"share",
			"perYear",
			"nextDue",
			"status",
		]);
	});

	test("text columns and Next due sort ascending first, figures descending first", () => {
		const first = Object.fromEntries(
			TABLE_COLUMNS.map((column) => [column.id, column.firstDirection]),
		);
		expect(first).toEqual({
			name: "asc",
			category: "asc",
			price: "desc",
			perMonth: "desc",
			share: "desc",
			perYear: "desc",
			nextDue: "asc",
			status: "asc",
		});
	});

	test("starts sorted by Per month, largest first", () => {
		expect(DEFAULT_SORT).toEqual({ column: "perMonth", direction: "desc" });
	});

	test("has the caption", () => {
		expect(TABLE_CAPTION).toBe(
			"Ended Subscriptions aren't in the table or the totals. Select a column heading to sort.",
		);
	});

	test("the status words", () => {
		expect(STATUS_LABELS).toEqual({
			active: "Active",
			ending: "Ending",
			upcoming: "Starts soon",
			paused: "Paused",
		});
	});
});

describe("tableRows on golden (BR-F05-39)", () => {
	// AC-F05-35
	test("holds every Subscription's cells", () => {
		const rows = tableRows(list(), F);
		const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
		expect(byName["Netflix"]).toMatchObject({
			categoryLabel: "Entertainment",
			price: "₹649.00 a month",
			perMonth: "₹649.00",
			perYear: "₹7,788.00",
			share: "3.2%",
			nextDue: "5 Nov",
			status: "Active",
		});
		expect(byName["Sunrise Apartments"]).toMatchObject({
			categoryLabel: "Housing",
			price: "₹18,000.00 a month",
			perMonth: "₹18,000.00",
			perYear: "₹2,16,000.00",
			share: "88.8%",
			nextDue: "1 Dec",
		});
		expect(byName["Cult Gym"]).toMatchObject({
			categoryLabel: "Health",
			perMonth: "₹1,500.00",
			share: "7.4%",
			nextDue: "10 Nov",
		});
		expect(byName["Amazon Prime"]).toMatchObject({
			price: "₹1,499.00 a year",
			perMonth: "₹124.92",
			perYear: "₹1,499.00",
			share: "0.6%",
			nextDue: "12 Oct 2027",
		});
	});

	test("the shares are tenths of a percent of the yearly total and add up to 100.0", () => {
		const rows = tableRows(list(), F);
		const tenths = rows.map((row) => row.shareTenths);
		expect(
			Object.fromEntries(rows.map((row) => [row.name, row.shareTenths])),
		).toEqual({
			Netflix: 32,
			"Amazon Prime": 6,
			"Sunrise Apartments": 888,
			"Cult Gym": 74,
		});
		expect(tenths.reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(
			1000,
		);
	});

	test("rows keep the list's order until sorted, and carry the item and its id", () => {
		const items = golden();
		const rows = tableRows(list(items), F);
		expect(rows.map((row) => row.id)).toEqual(items.map((item) => item.id));
		expect(rows[0]!.item).toBe(items[0]);
	});

	test("the sort keys are the figures themselves", () => {
		const row = tableRows(list(), F).find(
			(each) => each.name === "Amazon Prime",
		)!;
		expect(row).toMatchObject({
			amountMinor: 149900,
			monthlyMinor: 12492,
			yearlyMinor: 149900,
			nextDueOn: "2027-10-12",
		});
	});
});

describe("which Subscriptions are rows (BR-F05-39)", () => {
	test("an ended Subscription is not", () => {
		const rows = tableRows(
			list([
				...golden(),
				extra("Gone", {
					status: "ended",
					endDate: "2026-09-30",
					nextDueOn: null,
				}),
			]),
			F,
		);
		expect(rows.map((row) => row.name)).not.toContain("Gone");
		expect(rows).toHaveLength(4);
	});

	test("an upcoming, a paused and an ending Subscription are, with their status in words", () => {
		const rows = tableRows(
			list([
				extra("Soon", { status: "upcoming", nextDueOn: "2026-12-05" }),
				extra("Held", { status: "paused", nextDueOn: "2027-01-05" }),
				extra("Leaving", { status: "ending", endDate: "2026-12-31" }),
			]),
			F,
		);
		expect(rows.map((row) => row.status)).toEqual([
			"Starts soon",
			"Paused",
			"Ending",
		]);
	});

	test("an empty list has no rows", () => {
		expect(
			tableRows(list([], { monthlyMinor: 0, yearlyMinor: 0, count: 0 }), F),
		).toEqual([]);
	});
});

describe("a Subscription with no next due date (BR-F05-17, BR-F05-39)", () => {
	const none = () =>
		extra("Quiet", { nextDueOn: null, status: "ending", endDate: "2026-11-01" });

	test("shows its costs, and a dash as Share and Next due", () => {
		const row = tableRows(list([...golden(), none()]), F).find(
			(each) => each.name === "Quiet",
		)!;
		expect(row).toMatchObject({
			perMonth: "₹649.00",
			perYear: "₹7,788.00",
			share: "—",
			shareTenths: null,
			nextDue: "—",
			nextDueOn: null,
		});
	});

	test("does not change the others' shares, which come from the list's total", () => {
		const rows = tableRows(list([...golden(), none()]), F);
		expect(rows.find((each) => each.name === "Sunrise Apartments")!.share).toBe(
			"88.8%",
		);
	});
});

describe("a list with no yearly total", () => {
	test("has no share for any row and divides by nothing", () => {
		const rows = tableRows(
			list([extra("Quiet", { nextDueOn: null })], {
				monthlyMinor: 0,
				yearlyMinor: 0,
				count: 0,
			}),
			F,
		);
		expect(rows[0]).toMatchObject({ share: "—", shareTenths: null });
	});

	test("not even for a row with a next due date", () => {
		const rows = tableRows(
			list(golden(), { monthlyMinor: 0, yearlyMinor: 0, count: 4 }),
			F,
		);
		expect(
			rows.every((row) => row.share === "—" && row.shareTenths === null),
		).toBe(true);
	});
});

describe("the date locale reaches the cells (D-618)", () => {
	test("Next due and the figures follow the profile", () => {
		const us: Formats = {
			currency: "USD",
			numberLocale: "en-US",
			dateLocale: "en-US",
			today: "2026-11-02",
		};
		const row = tableRows(list([subscriptionItem("netflix")]), us)[0]!;
		expect(row).toMatchObject({
			nextDue: "Nov 5",
			perMonth: "$649.00",
			price: "$649.00 a month",
		});
	});
});

describe("tableTotal (BR-F05-39)", () => {
	// AC-F05-35
	test("reads the count and the list's two totals", () => {
		expect(tableTotal(TOTALS, F)).toEqual({
			label: "Total · 4",
			perMonth: "₹20,273.92",
			perYear: "₹2,43,287.00",
		});
	});

	test("counts only what the list counted", () => {
		expect(
			tableTotal({ monthlyMinor: 64900, yearlyMinor: 778800, count: 1 }, F)
				.label,
		).toBe("Total · 1");
		expect(tableTotal({ monthlyMinor: 0, yearlyMinor: 0, count: 0 }, F)).toEqual(
			{
				label: "Total · 0",
				perMonth: "₹0.00",
				perYear: "₹0.00",
			},
		);
	});
});

describe("sortTableRows (BR-F05-39)", () => {
	const rows = () => tableRows(list(), F);

	// AC-F05-35
	test("by Per month, largest first, is Sunrise, Cult Gym, Netflix, Amazon Prime", () => {
		expect(order(rows(), "perMonth", "desc")).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Netflix",
			"Amazon Prime",
		]);
		expect(order(rows(), DEFAULT_SORT.column, DEFAULT_SORT.direction)).toEqual(
			order(rows(), "perMonth", "desc"),
		);
	});

	test("by Per month ascending reverses it", () => {
		expect(order(rows(), "perMonth", "asc")).toEqual([
			"Amazon Prime",
			"Netflix",
			"Cult Gym",
			"Sunrise Apartments",
		]);
	});

	test("Share sorts as Per month", () => {
		expect(order(rows(), "share", "desc")).toEqual(
			order(rows(), "perMonth", "desc"),
		);
		expect(order(rows(), "share", "asc")).toEqual(
			order(rows(), "perMonth", "asc"),
		);
	});

	// BR-F05-39: Share sorts as Per month, so two Subscriptions whose monthly figures round to the
	// same amount tie there and keep name order, though their yearly costs differ.
	test("Share sorts by the monthly figure, not the yearly one", () => {
		const close = tableRows(
			list(
				[
					extra("Zed", { monthlyMinor: 100, yearlyMinor: 1203 }),
					extra("Alpha", { monthlyMinor: 100, yearlyMinor: 1200 }),
				],
				{ monthlyMinor: 200, yearlyMinor: 2403, count: 2 },
			),
			F,
		);
		expect(order(close, "share", "desc")).toEqual(["Alpha", "Zed"]);
		expect(order(close, "perMonth", "desc")).toEqual(["Alpha", "Zed"]);
		expect(order(close, "perYear", "desc")).toEqual(["Zed", "Alpha"]);
	});

	test("by Name, in lower case by code unit", () => {
		expect(order(rows(), "name", "asc")).toEqual([
			"Amazon Prime",
			"Cult Gym",
			"Netflix",
			"Sunrise Apartments",
		]);
		expect(order(rows(), "name", "desc")).toEqual([
			"Sunrise Apartments",
			"Netflix",
			"Cult Gym",
			"Amazon Prime",
		]);
	});

	test("a name's case never changes its place", () => {
		const mixed = tableRows(
			list([extra("Zebra"), extra("apple"), extra("Banana")]),
			F,
		);
		expect(order(mixed, "name", "asc")).toEqual(["apple", "Banana", "Zebra"]);
	});

	test("by Category, by its label, with a tie kept in name order whichever the direction", () => {
		expect(order(rows(), "category", "asc")).toEqual([
			"Amazon Prime",
			"Netflix",
			"Cult Gym",
			"Sunrise Apartments",
		]);
		expect(order(rows(), "category", "desc")).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Amazon Prime",
			"Netflix",
		]);
	});

	test("by Price, the amount whatever the cadence", () => {
		expect(order(rows(), "price", "desc")).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Amazon Prime",
			"Netflix",
		]);
		expect(order(rows(), "price", "asc")).toEqual([
			"Netflix",
			"Amazon Prime",
			"Cult Gym",
			"Sunrise Apartments",
		]);
	});

	test("by Per year", () => {
		expect(order(rows(), "perYear", "desc")).toEqual([
			"Sunrise Apartments",
			"Cult Gym",
			"Netflix",
			"Amazon Prime",
		]);
		expect(order(rows(), "perYear", "asc")).toEqual([
			"Amazon Prime",
			"Netflix",
			"Cult Gym",
			"Sunrise Apartments",
		]);
	});

	test("by Next due, soonest first", () => {
		expect(order(rows(), "nextDue", "asc")).toEqual([
			"Netflix",
			"Cult Gym",
			"Sunrise Apartments",
			"Amazon Prime",
		]);
		expect(order(rows(), "nextDue", "desc")).toEqual([
			"Amazon Prime",
			"Sunrise Apartments",
			"Cult Gym",
			"Netflix",
		]);
	});

	test("by Next due compares dates, not their words", () => {
		// "10 Nov" would come before "5 Nov" as text.
		const two = tableRows(
			list([
				extra("Late", { nextDueOn: "2026-11-10" }),
				extra("Early", { nextDueOn: "2026-11-05" }),
			]),
			F,
		);
		expect(order(two, "nextDue", "asc")).toEqual(["Early", "Late"]);
	});

	test("by Status, by its label, then by name", () => {
		const mixed = tableRows(
			list([
				extra("A", { status: "upcoming", nextDueOn: "2026-12-05" }),
				extra("B", { status: "paused", nextDueOn: "2027-01-05" }),
				extra("C", { status: "ending", endDate: "2026-12-31" }),
				extra("D"),
				extra("E"),
			]),
			F,
		);
		expect(order(mixed, "status", "asc")).toEqual(["D", "E", "C", "B", "A"]);
		expect(order(mixed, "status", "desc")).toEqual(["A", "B", "C", "D", "E"]);
	});

	describe("a Subscription with no next due date sorts last in either direction", () => {
		const withNone = () =>
			tableRows(
				list([
					...golden(),
					extra("Quiet", {
						nextDueOn: null,
						status: "ending",
						endDate: "2026-11-01",
					}),
				]),
				F,
			);

		test("by Next due ascending", () => {
			expect(order(withNone(), "nextDue", "asc").at(-1)).toBe("Quiet");
		});

		test("by Next due descending", () => {
			expect(order(withNone(), "nextDue", "desc").at(-1)).toBe("Quiet");
		});

		test("two of them keep name order, and stay last", () => {
			const two = tableRows(
				list([
					extra("Zed", { nextDueOn: null }),
					extra("Alpha", { nextDueOn: null }),
					extra("Dated", { nextDueOn: "2026-11-05" }),
				]),
				F,
			);
			expect(order(two, "nextDue", "asc")).toEqual(["Dated", "Alpha", "Zed"]);
			expect(order(two, "nextDue", "desc")).toEqual(["Dated", "Alpha", "Zed"]);
		});

		test("by the other columns it sorts by its figures like any row", () => {
			const names = order(withNone(), "perMonth", "desc");
			expect(names.indexOf("Quiet")).toBeGreaterThan(
				names.indexOf("Cult Gym"),
			);
			expect(names.indexOf("Quiet")).toBeLessThan(
				names.indexOf("Amazon Prime"),
			);
		});
	});

	test("rows that tie keep name order, then id, whichever the direction", () => {
		const a = extra("Same", { id: "0192f0c4-7a1e-7c3b-9d2a-00000000000b" });
		const b = extra("Same", { id: "0192f0c4-7a1e-7c3b-9d2a-00000000000a" });
		const tied = tableRows(list([a, b]), F);
		expect(
			sortTableRows(tied, { column: "perMonth", direction: "desc" }).map(
				(r) => r.id,
			),
		).toEqual([b.id, a.id]);
		expect(
			sortTableRows(tied, { column: "perMonth", direction: "asc" }).map(
				(r) => r.id,
			),
		).toEqual([b.id, a.id]);
	});

	test("does not change the rows it is given", () => {
		const given = rows();
		const before = given.map((row) => row.id);
		sortTableRows(given, { column: "name", direction: "desc" });
		expect(given.map((row) => row.id)).toEqual(before);
	});

	test("an empty table sorts to an empty table", () => {
		expect(sortTableRows([], DEFAULT_SORT)).toEqual([]);
	});

	test.each(TABLE_COLUMNS.map((column) => column.id))(
		"every row is kept when sorting by %s, in both directions",
		(column) => {
			for (const direction of ["asc", "desc"] as const) {
				expect(sortTableRows(rows(), { column, direction })).toHaveLength(4);
			}
		},
	);

	test("a column sorted ascending and then descending is exactly reversed when nothing ties", () => {
		for (const column of [
			"name",
			"perMonth",
			"perYear",
			"price",
			"nextDue",
		] as const) {
			const up = order(rows(), column, "asc");
			expect(order(rows(), column, "desc")).toEqual([...up].reverse());
		}
	});
});
