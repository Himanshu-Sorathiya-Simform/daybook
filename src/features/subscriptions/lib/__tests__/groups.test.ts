import { describe, expect, test } from "vitest";

import type { UpcomingEntry } from "@/lib/subscriptions/model";
import {
	ENDED_PREVIEW,
	endedToggle,
	flatOrder,
	groupHeader,
	listGroups,
	NO_RUNNING,
	shownRows,
} from "../groups";
import type { Formats } from "../labels";
import { subscriptionItem } from "./fixtures";

const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};
const TODAY = "2026-11-02";

const golden = () => [
	subscriptionItem("amazonPrime"),
	subscriptionItem("sunrise"),
	subscriptionItem("cultGym"),
	subscriptionItem("netflix"),
];

const entry = (
	name: Parameters<typeof subscriptionItem>[0],
	dueOn: string,
): UpcomingEntry => {
	const item = subscriptionItem(name);
	return { subscriptionId: item.id, dueOn, amountMinor: item.amountMinor };
};

// AC-F05-02: golden's next 30 days hold three charges, 20,149.00 in all.
const GOLDEN_UPCOMING = [
	entry("netflix", "2026-11-05"),
	entry("cultGym", "2026-11-10"),
	entry("sunrise", "2026-12-01"),
];

let n = 0;
/** A Subscription of its own, due on `due`, with `changes` over it. */
function sub(
	name: string,
	due: string | null,
	changes: Partial<ReturnType<typeof subscriptionItem>> = {},
) {
	n += 1;
	return subscriptionItem("netflix", {
		id: `0192f0c4-7a1e-7c3b-9d2a-${String(n).padStart(12, "0")}`,
		name,
		nextDueOn: due,
		...changes,
	});
}

const ended = (name: string, endDate: string) =>
	sub(name, null, { status: "ended", endDate });

const names = (rows: { item: { name: string } }[]) =>
	rows.map((row) => row.item.name);

describe("listGroups on golden (BR-F05-37)", () => {
	// AC-F05-34
	test("Within 7 days holds Netflix, Within 30 days Cult Gym and Sunrise, Later Amazon Prime", () => {
		const { groups } = listGroups(golden(), GOLDEN_UPCOMING, TODAY);
		expect(groups.map((group) => group.key)).toEqual([
			"within7",
			"within30",
			"later",
		]);
		expect(names(groups[0]!.rows)).toEqual(["Netflix"]);
		expect(names(groups[1]!.rows)).toEqual(["Cult Gym", "Sunrise Apartments"]);
		expect(names(groups[2]!.rows)).toEqual(["Amazon Prime"]);
	});

	test("the two time groups carry 649.00 and 19,500.00, which add up to the Next 30 days total", () => {
		const { groups } = listGroups(golden(), GOLDEN_UPCOMING, TODAY);
		expect(groups[0]!.totalMinor).toBe(64900);
		expect(groups[1]!.totalMinor).toBe(1950000);
		expect(groups[2]!.totalMinor).toBeNull();
		expect(64900 + 1950000).toBe(2014900);
	});

	test("the headers read the count and the figure", () => {
		const { groups } = listGroups(golden(), GOLDEN_UPCOMING, TODAY);
		expect(groups.map((group) => groupHeader(group, F))).toEqual([
			{ label: "Within 7 days · 1", figure: "₹649.00" },
			{ label: "Within 30 days · 2", figure: "₹19,500.00" },
			{ label: "Later · 1", figure: null },
		]);
	});

	test("there is a running Subscription and no Ended or No more charges group", () => {
		const { groups, hasRunning } = listGroups(golden(), GOLDEN_UPCOMING, TODAY);
		expect(hasRunning).toBe(true);
		expect(
			groups.some((group) => group.key === "ended" || group.key === "none"),
		).toBe(false);
	});

	test("each row carries what it charges in the next 30 days", () => {
		const { groups } = listGroups(golden(), GOLDEN_UPCOMING, TODAY);
		expect(groups[0]!.rows[0]).toMatchObject({
			upcomingCount: 1,
			upcomingMinor: 64900,
		});
		expect(groups[2]!.rows[0]).toMatchObject({
			upcomingCount: 0,
			upcomingMinor: 0,
		});
	});

	test("does not change the items it is given", () => {
		const items = golden();
		const before = JSON.stringify(items);
		listGroups(items, GOLDEN_UPCOMING, TODAY);
		expect(JSON.stringify(items)).toBe(before);
	});
});

describe("which group a next due date falls in", () => {
	const groupOf = (due: string | null) =>
		listGroups([sub("X", due)], [], TODAY).groups[0]!.key;

	test.each([
		["2026-11-02", "within7", "today"],
		["2026-11-09", "within7", "today + 7"],
		["2026-11-10", "within30", "today + 8"],
		["2026-12-02", "within30", "today + 30"],
		["2026-12-03", "later", "today + 31"],
		["2036-11-02", "later", "ten years on"],
	])("%s is %s (%s)", (due, key) => {
		expect(groupOf(due)).toBe(key);
	});

	// D-619
	test("a due date that has passed, with the page left open past midnight, stays in Within 7 days", () => {
		expect(groupOf("2026-11-01")).toBe("within7");
		expect(groupOf("2026-10-01")).toBe("within7");
	});

	test("no next due is No more charges", () => {
		expect(groupOf(null)).toBe("none");
	});

	test("a status of ended is Ended, whatever else the item holds", () => {
		const group = listGroups(
			[sub("X", "2026-11-05", { status: "ended", endDate: "2026-11-02" })],
			[],
			TODAY,
		).groups[0]!;
		expect(group.key).toBe("ended");
	});

	test("the boundaries follow the profile's today, across a year end", () => {
		const items = [sub("X", "2027-01-08")];
		const key = (today: string) => listGroups(items, [], today).groups[0]!.key;
		// today + 7 is 8 January from 1 January, today + 30 is 8 January from 9 December.
		expect(key("2027-01-01")).toBe("within7");
		expect(key("2026-12-31")).toBe("within30");
		expect(key("2026-12-09")).toBe("within30");
		expect(key("2026-12-08")).toBe("later");
	});
});

describe("the order of groups and rows (BR-F05-37)", () => {
	test("groups keep their order whatever the order of the items", () => {
		const items = [
			ended("E", "2026-09-30"),
			sub("N", null),
			sub("L", "2027-03-01"),
			sub("S", "2026-11-20"),
			sub("W", "2026-11-04"),
		];
		const { groups } = listGroups(items, [], TODAY);
		expect(groups.map((group) => group.key)).toEqual([
			"within7",
			"within30",
			"later",
			"none",
			"ended",
		]);
	});

	test("a group with no row is left out", () => {
		expect(
			listGroups([sub("S", "2026-11-20")], [], TODAY).groups.map((g) => g.key),
		).toEqual(["within30"]);
	});

	test("rows sort by next due, then by name", () => {
		const items = [
			sub("Zeta", "2026-11-04"),
			sub("Beta", "2026-11-05"),
			sub("Alpha", "2026-11-05"),
			sub("Omega", "2026-11-03"),
		];
		expect(names(listGroups(items, [], TODAY).groups[0]!.rows)).toEqual([
			"Omega",
			"Zeta",
			"Alpha",
			"Beta",
		]);
	});

	test("names compare in lower case by code unit, as BR-F05-20 says", () => {
		// With capitals compared as they are, "Zebra" would come before "apple".
		const items = [
			sub("Zebra", "2026-11-05"),
			sub("apple", "2026-11-05"),
			sub("Banana", "2026-11-05"),
		];
		expect(names(listGroups(items, [], TODAY).groups[0]!.rows)).toEqual([
			"apple",
			"Banana",
			"Zebra",
		]);
	});

	test("two with the same date and name keep the id's order", () => {
		const a = sub("Same", "2026-11-05", {
			id: "0192f0c4-7a1e-7c3b-9d2a-00000000000b",
		});
		const b = sub("Same", "2026-11-05", {
			id: "0192f0c4-7a1e-7c3b-9d2a-00000000000a",
		});
		const rows = listGroups([a, b], [], TODAY).groups[0]!.rows;
		expect(rows.map((row) => row.item.id)).toEqual([b.id, a.id]);
	});

	test("Later sorts by next due, then name", () => {
		const items = [
			sub("B", "2027-06-01"),
			sub("A", "2027-06-01"),
			sub("C", "2027-01-01"),
		];
		expect(names(listGroups(items, [], TODAY).groups[0]!.rows)).toEqual([
			"C",
			"A",
			"B",
		]);
	});

	test("No more charges sorts by name the same way", () => {
		const items = [sub("zulu", null), sub("Alpha", null), sub("mike", null)];
		const group = listGroups(items, [], TODAY).groups[0]!;
		expect(group.key).toBe("none");
		expect(names(group.rows)).toEqual(["Alpha", "mike", "zulu"]);
		expect(group.totalMinor).toBeNull();
	});

	test("Ended sorts by end date, newest first, then name", () => {
		const items = [
			ended("Old", "2025-12-31"),
			ended("Beta", "2026-09-30"),
			ended("New", "2026-11-02"),
			ended("Alpha", "2026-09-30"),
		];
		const group = listGroups(items, [], TODAY).groups[0]!;
		expect(names(group.rows)).toEqual(["New", "Alpha", "Beta", "Old"]);
	});

	test("an Ended row whose end date is missing sorts last", () => {
		const items = [
			sub("X", null, { status: "ended", endDate: null }),
			ended("Y", "2020-01-01"),
		];
		expect(names(listGroups(items, [], TODAY).groups[0]!.rows)).toEqual([
			"Y",
			"X",
		]);
	});
});

describe("what each row charges in the next 30 days (BR-F05-22)", () => {
	test("a weekly Subscription with five charges counts all five, and its group's figure holds them", () => {
		const weekly = sub("Weekly", "2026-11-04", {
			amountMinor: 12000,
			cadence: { unit: "week", every: 1 },
		});
		const upcoming = [
			"2026-11-04",
			"2026-11-11",
			"2026-11-18",
			"2026-11-25",
			"2026-12-02",
		].map((dueOn) => ({ subscriptionId: weekly.id, dueOn, amountMinor: 12000 }));
		const group = listGroups([weekly], upcoming, TODAY).groups[0]!;
		expect(group.key).toBe("within7");
		expect(group.rows[0]).toMatchObject({
			upcomingCount: 5,
			upcomingMinor: 60000,
		});
		expect(group.totalMinor).toBe(60000);
	});

	test("the time groups' figures add up to the whole upcoming list's total", () => {
		const weekly = sub("Weekly", "2026-11-04", { amountMinor: 12000 });
		const monthly = sub("Monthly", "2026-11-20", { amountMinor: 50000 });
		const later = sub("Later", "2027-02-01", { amountMinor: 99900 });
		const upcoming: UpcomingEntry[] = [
			...[
				"2026-11-04",
				"2026-11-11",
				"2026-11-18",
				"2026-11-25",
				"2026-12-02",
			].map((dueOn) => ({
				subscriptionId: weekly.id,
				dueOn,
				amountMinor: 12000,
			})),
			{ subscriptionId: monthly.id, dueOn: "2026-11-20", amountMinor: 50000 },
		];
		const { groups } = listGroups([weekly, monthly, later], upcoming, TODAY);
		const total = groups.reduce(
			(sum, group) => sum + (group.totalMinor ?? 0),
			0,
		);
		expect(total).toBe(upcoming.reduce((sum, e) => sum + e.amountMinor, 0));
		expect(total).toBe(110000);
	});

	test("a Subscription with no entry has none", () => {
		const row = listGroups([sub("X", "2026-11-04")], [], TODAY).groups[0]!
			.rows[0]!;
		expect(row).toMatchObject({ upcomingCount: 0, upcomingMinor: 0 });
	});

	test("an entry of an ended Subscription, which adds nothing, is ignored", () => {
		const item = sub("Gone", null, { status: "ended", endDate: "2026-10-01" });
		const row = listGroups(
			[item],
			[{ subscriptionId: item.id, dueOn: "2026-11-05", amountMinor: 100 }],
			TODAY,
		).groups[0]!.rows[0]!;
		expect(row).toMatchObject({ upcomingCount: 0, upcomingMinor: 0 });
	});

	test("an entry of an unknown Subscription is ignored", () => {
		const { groups } = listGroups(
			[sub("X", "2026-11-04")],
			[{ subscriptionId: "elsewhere", dueOn: "2026-11-05", amountMinor: 100 }],
			TODAY,
		);
		expect(groups[0]!.totalMinor).toBe(0);
	});

	test("a paused Subscription due after its pause has no charge in the window, and sits by its next due", () => {
		const paused = sub("Paused", "2027-01-05", { status: "paused" });
		const { groups } = listGroups([paused], [], TODAY);
		expect(groups[0]).toMatchObject({ key: "later" });
		expect(groups[0]!.rows[0]).toMatchObject({ upcomingCount: 0 });
	});
});

describe("hasRunning (BR-F05-37)", () => {
	test("no Subscription at all", () => {
		expect(listGroups([], [], TODAY)).toEqual({ groups: [], hasRunning: false });
	});

	test("only ended ones", () => {
		const { groups, hasRunning } = listGroups(
			[ended("A", "2026-01-01")],
			[],
			TODAY,
		);
		expect(hasRunning).toBe(false);
		expect(groups.map((group) => group.key)).toEqual(["ended"]);
	});

	test("an upcoming, a paused and a no-more-charges Subscription are running", () => {
		expect(listGroups([sub("A", null)], [], TODAY).hasRunning).toBe(true);
		expect(
			listGroups([sub("A", "2027-01-05", { status: "paused" })], [], TODAY)
				.hasRunning,
		).toBe(true);
		expect(
			listGroups([sub("A", "2026-12-05", { status: "upcoming" })], [], TODAY)
				.hasRunning,
		).toBe(true);
	});

	test("the empty line says to resume one below or add a new one", () => {
		expect(NO_RUNNING).toBe(
			"No running Subscriptions. Resume one below, or add a new one.",
		);
	});
});

describe("groupHeader (BR-F05-37)", () => {
	const header = (
		key: "within7" | "within30" | "later" | "none" | "ended",
		count: number,
		total: number | null,
	) =>
		groupHeader(
			{
				key,
				rows: Array.from({ length: count }, () => ({}) as never),
				totalMinor: total,
			},
			F,
		);

	test("writes the label, a dot and the count", () => {
		expect(header("within7", 1, 64900).label).toBe("Within 7 days · 1");
		expect(header("within30", 12, 0).label).toBe("Within 30 days · 12");
		expect(header("later", 3, null).label).toBe("Later · 3");
		expect(header("none", 2, null).label).toBe("No more charges · 2");
		expect(header("ended", 8, null).label).toBe("Ended · 8");
	});

	test("the time groups carry a figure, even zero, and the rest none", () => {
		expect(header("within7", 1, 0).figure).toBe("₹0.00");
		expect(header("within30", 2, 1950000).figure).toBe("₹19,500.00");
		expect(header("later", 1, null).figure).toBeNull();
		expect(header("none", 1, null).figure).toBeNull();
		expect(header("ended", 1, null).figure).toBeNull();
	});
});

describe("the Ended group's preview (BR-F05-37)", () => {
	const eight = Array.from({ length: 8 }, (_, i) =>
		ended(`E${i}`, `2026-0${i + 1}-15`),
	);
	const group = (count: number) =>
		listGroups(eight.slice(0, count), [], TODAY).groups[0]!;

	test("shows 5 rows, newest first, until it shows all", () => {
		expect(ENDED_PREVIEW).toBe(5);
		const shown = shownRows(group(8), { endedAll: false });
		expect(names(shown)).toEqual(["E7", "E6", "E5", "E4", "E3"]);
	});

	test("shows every row once it shows all", () => {
		expect(shownRows(group(8), { endedAll: true })).toHaveLength(8);
	});

	test.each([1, 3, 5])("a group of %i shows them all either way", (count) => {
		expect(shownRows(group(count), { endedAll: false })).toHaveLength(count);
		expect(shownRows(group(count), { endedAll: true })).toHaveLength(count);
	});

	test("a group of 6 shows 5 and then 6", () => {
		expect(shownRows(group(6), { endedAll: false })).toHaveLength(5);
		expect(shownRows(group(6), { endedAll: true })).toHaveLength(6);
	});

	test("the other groups always show every row", () => {
		const many = Array.from({ length: 9 }, (_, i) => sub(`S${i}`, "2026-11-20"));
		const within30 = listGroups(many, [], TODAY).groups[0]!;
		expect(shownRows(within30, { endedAll: false })).toHaveLength(9);
	});

	test("the button reads Show all 8, then Show fewer", () => {
		expect(endedToggle(8, false)).toBe("Show all 8");
		expect(endedToggle(8, true)).toBe("Show fewer");
		expect(endedToggle(6, false)).toBe("Show all 6");
	});

	test.each([0, 1, 4, 5])("with %i rows there is no button", (count) => {
		expect(endedToggle(count, false)).toBeNull();
		expect(endedToggle(count, true)).toBeNull();
	});
});

describe("flatOrder, the order Up and Down walk (BR-F05-45)", () => {
	const items = () => [
		...golden(),
		sub("Quiet", null),
		...Array.from({ length: 8 }, (_, i) => ended(`E${i}`, `2026-0${i + 1}-15`)),
	];
	const { groups } = listGroups(items(), GOLDEN_UPCOMING, TODAY);
	const idsOf = (list: { item: { id: string; name: string } }[]) =>
		list.map((row) => row.item.id);

	test("walks every group in order and leaves Ended out while it is collapsed", () => {
		const order = flatOrder(groups, { endedOpen: false, endedAll: false });
		expect(order).toEqual([
			...idsOf(groups[0]!.rows),
			...idsOf(groups[1]!.rows),
			...idsOf(groups[2]!.rows),
			...idsOf(groups[3]!.rows),
		]);
		expect(order).toHaveLength(5);
	});

	test("an expanded Ended group adds its first 5", () => {
		const order = flatOrder(groups, { endedOpen: true, endedAll: false });
		expect(order).toHaveLength(10);
		expect(order.slice(5)).toEqual(idsOf(groups[4]!.rows.slice(0, 5)));
	});

	test("an Ended group showing all adds its 8", () => {
		expect(flatOrder(groups, { endedOpen: true, endedAll: true })).toHaveLength(
			13,
		);
	});

	test("showing all with the group collapsed still leaves it out", () => {
		expect(flatOrder(groups, { endedOpen: false, endedAll: true })).toHaveLength(
			5,
		);
	});

	test("no groups, no rows", () => {
		expect(flatOrder([], { endedOpen: true, endedAll: true })).toEqual([]);
	});
});
