import { describe, expect, test } from "vitest";

import type { WeekStart } from "@/lib/geo";
import type { MonthItem, MonthItemKind } from "@/lib/subscriptions/model";
import { weekdayIndex } from "@/lib/time";
import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import {
	CALENDAR_TEXT,
	calendarItems,
	calendarTitle,
	canMoveMonths,
	chipAmount,
	chipColor,
	chipLabel,
	countedMinor,
	dayPopover,
	gridWeeks,
	isStruck,
	itemWord,
	LEGEND,
	MONTH_REACH,
	MONTH_STEP,
	MONTH_CELL_WIDTH,
	MONTH_ROW_CHROME,
	MONTHS_DEFAULT,
	MONTHS_MAX,
	MONTHS_MIN,
	monthsBefore,
	monthsFit,
	monthCells,
	monthSpan,
	monthWindow,
	phoneRows,
	phoneWeekHint,
	phoneWeeks,
	weekdayHeaders,
} from "../calendar";
import type { Formats } from "../labels";
import { charge, subscriptionItem } from "./fixtures";

const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

const goldenItems = () => [
	subscriptionItem("netflix"),
	subscriptionItem("amazonPrime"),
	subscriptionItem("sunrise"),
	subscriptionItem("cultGym"),
];

/** A charge of golden's Subscription on `date`. */
function charged(
	name: keyof typeof GOLDEN_SUBSCRIPTIONS,
	date: string,
	amountMinor: number,
) {
	const golden = GOLDEN_SUBSCRIPTIONS[name];
	return charge({
		subscriptionId: golden.id,
		subscription: { id: golden.id, name: golden.name },
		payee: golden.name,
		category: golden.category,
		occurredOn: date,
		dueOn: date,
		amountMinor,
	});
}

const OCTOBER = [
	charged("sunrise", "2026-10-01", 1800000),
	charged("netflix", "2026-10-05", 64900),
	charged("amazonPrime", "2026-10-12", 149900),
];
const NOVEMBER = [charged("sunrise", "2026-11-01", 1800000)];

const item = (
	kind: MonthItemKind,
	date: string,
	name: string,
	amountMinor: number,
	category = "entertainment",
): MonthItem => ({
	date,
	kind,
	subscriptionId: name,
	name,
	category,
	amountMinor,
	chargeId: kind === "charged" ? `charge-${name}` : null,
});

describe("the constants (BR-F05-38)", () => {
	test("4 to 8 months by the row's width, moving by 3", () => {
		expect(MONTHS_MIN).toBe(4);
		expect(MONTHS_MAX).toBe(8);
		expect(MONTHS_DEFAULT).toBe(5);
		expect(MONTH_STEP).toBe(3);
		expect(MONTH_CELL_WIDTH).toBe(88);
		expect(MONTH_ROW_CHROME).toBe(96);
	});

	test("the words", () => {
		expect(CALENDAR_TEXT).toEqual({
			monthRowLabel: "Month",
			earlier: "Earlier months",
			later: "Later months",
			weekColumn: "Week",
			popoverHint: "Select one to open it in the panel.",
			nothingDue: "Nothing due · Show days",
			loading: "Loading the month",
			deletedCharge:
				"This charge belongs to a deleted Subscription. It stays in Transactions as an ordinary expense.",
		});
	});

	test("the legend, with the pending line marked for M5", () => {
		expect(LEGEND.map((line) => line.text)).toEqual([
			"Filled dot: charged",
			"Ring: due",
			"Struck: skipped or paused",
			"Dashed ring: pending sync",
		]);
		expect(
			LEGEND.filter((line) => line.fromM5).map((line) => line.text),
		).toEqual(["Dashed ring: pending sync"]);
	});
});

describe("monthsFit (BR-F05-38)", () => {
	const row = (months: number) => MONTH_ROW_CHROME + months * MONTH_CELL_WIDTH;

	test("shows as many months as fit, each at least 88 px wide", () => {
		expect(monthsFit(row(5))).toBe(5);
		expect(monthsFit(row(6))).toBe(6);
		expect(monthsFit(row(7))).toBe(7);
		expect(monthsFit(row(8))).toBe(8);
	});

	test("one pixel short of a month does not show it", () => {
		expect(monthsFit(row(6) - 1)).toBe(5);
		expect(monthsFit(row(7) - 1)).toBe(6);
	});

	test("never fewer than 4, however narrow", () => {
		expect(monthsFit(row(4))).toBe(4);
		expect(monthsFit(row(3))).toBe(4);
		expect(monthsFit(120)).toBe(4);
		expect(monthsFit(1)).toBe(4);
	});

	test("never more than 8, however wide", () => {
		expect(monthsFit(row(9))).toBe(8);
		expect(monthsFit(5000)).toBe(8);
	});

	test("an unknown width shows the default", () => {
		expect(monthsFit(null)).toBe(5);
	});

	test("a width of 0, as before the page is laid out, shows the default", () => {
		expect(monthsFit(0)).toBe(5);
		expect(monthsFit(-10)).toBe(5);
	});
});

describe("monthsBefore (BR-F05-38)", () => {
	test("1 before for 4 and 5 months, 2 for 6 and 7, 3 for 8", () => {
		expect([4, 5, 6, 7, 8].map(monthsBefore)).toEqual([1, 1, 2, 2, 3]);
	});
});

describe("monthWindow (BR-F05-38)", () => {
	test.each([
		[4, ["2026-10", "2026-11", "2026-12", "2027-01"]],
		[5, ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]],
		[6, ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]],
		[
			7,
			[
				"2026-09",
				"2026-10",
				"2026-11",
				"2026-12",
				"2027-01",
				"2027-02",
				"2027-03",
			],
		],
		[
			8,
			[
				"2026-08",
				"2026-09",
				"2026-10",
				"2026-11",
				"2026-12",
				"2027-01",
				"2027-02",
				"2027-03",
			],
		],
	])("%i months around the current one", (count, expected) => {
		expect(monthWindow("2026-11", 0, count)).toEqual(expected);
	});

	test("the current month is always in it", () => {
		for (const count of [4, 5, 6, 7, 8]) {
			expect(monthWindow("2026-11", 0, count)).toContain("2026-11");
		}
	});

	test("Later months moves it 3 on, Earlier months 3 back", () => {
		expect(monthWindow("2026-11", MONTH_STEP, 5)[0]).toBe("2027-01");
		expect(monthWindow("2026-11", -MONTH_STEP, 5)[0]).toBe("2026-07");
		expect(monthWindow("2026-11", 2 * MONTH_STEP, 8)[0]).toBe("2027-02");
		expect(monthWindow("2026-11", -MONTH_STEP, 8)[0]).toBe("2026-05");
	});

	test("crosses a year end in order, with no gap", () => {
		expect(monthWindow("2026-01", 0, 8)).toEqual([
			"2025-10",
			"2025-11",
			"2025-12",
			"2026-01",
			"2026-02",
			"2026-03",
			"2026-04",
			"2026-05",
		]);
	});
});

describe("monthCells (BR-F05-38)", () => {
	// AC-F05-24, section 5: October, November and December.
	const rows = [
		{ month: "2026-10", chargedMinor: 2014800, expectedMinor: 0 },
		{ month: "2026-11", chargedMinor: 1800000, expectedMinor: 214900 },
		{ month: "2026-12", chargedMinor: 0, expectedMinor: 2014900 },
	];
	const cells = (selected = "2026-11") =>
		monthCells(
			["2026-10", "2026-11", "2026-12", "2027-01"],
			rows,
			{ current: "2026-11", selected },
			F,
		);

	// AC-F05-38
	test("names each month by what it holds", () => {
		expect(cells().map((cell) => cell.label)).toEqual([
			"October 2026, charged ₹20,148.00",
			"November 2026, charged ₹18,000.00 of ₹20,149.00",
			"December 2026, expected ₹20,149.00",
			"January 2027, expected ₹0.00",
		]);
	});

	test("writes charged plus expected in whole units", () => {
		expect(cells().map((cell) => cell.figure)).toEqual([
			"₹20,148",
			"₹20,149",
			"₹20,149",
			"₹0",
		]);
	});

	test("rounds the figure half away from zero", () => {
		const [cell] = monthCells(
			["2026-12"],
			[{ month: "2026-12", chargedMinor: 0, expectedMinor: 12450 }],
			{ current: "2026-11", selected: "2026-11" },
			F,
		);
		expect(cell!.figure).toBe("₹125");
	});

	test("the short name, and the locale's own word for September", () => {
		expect(cells().map((cell) => cell.name)).toEqual([
			"Oct",
			"Nov",
			"Dec",
			"Jan",
		]);
		expect(
			monthCells(
				["2026-09"],
				[],
				{ current: "2026-11", selected: "2026-11" },
				F,
			)[0]!.name,
		).toBe("Sept");
	});

	test("the year shows only when it differs from the current one", () => {
		expect(cells().map((cell) => cell.year)).toEqual([null, null, null, "2027"]);
	});

	test("past months carry a check mark, the current month and later ones do not", () => {
		expect(cells().map((cell) => cell.past)).toEqual([
			true,
			false,
			false,
			false,
		]);
		expect(cells().map((cell) => cell.current)).toEqual([
			false,
			true,
			false,
			false,
		]);
	});

	test("the current month has a bar of its charged share, in tenths of a percent", () => {
		// 18,000.00 of 20,149.00 is 89.3%.
		expect(cells().map((cell) => cell.chargedTenths)).toEqual([
			null,
			893,
			null,
			null,
		]);
	});

	test("an empty current month has an empty bar", () => {
		const [cell] = monthCells(
			["2026-11"],
			[],
			{ current: "2026-11", selected: "2026-11" },
			F,
		);
		expect(cell!.chargedTenths).toBe(0);
		expect(cell!.label).toBe("November 2026, charged ₹0.00 of ₹0.00");
	});

	test("one month is selected", () => {
		expect(cells("2026-12").map((cell) => cell.selected)).toEqual([
			false,
			false,
			true,
			false,
		]);
		expect(cells("2030-01").some((cell) => cell.selected)).toBe(false);
	});

	test("keeps the months it is given, in order", () => {
		expect(cells().map((cell) => cell.month)).toEqual([
			"2026-10",
			"2026-11",
			"2026-12",
			"2027-01",
		]);
	});

	test("follows the locale's words and figures", () => {
		const us: Formats = {
			currency: "USD",
			numberLocale: "en-US",
			dateLocale: "en-US",
			today: "2026-11-02",
		};
		const [october] = monthCells(
			["2026-10"],
			rows,
			{ current: "2026-11", selected: "2026-11" },
			us,
		);
		expect(october!.label).toBe("October 2026, charged $20,148.00");
		expect(october!.figure).toBe("$20,148");
	});

	test("a month in a year before the current one shows that year", () => {
		const [cell] = monthCells(
			["2025-12"],
			[],
			{ current: "2026-11", selected: "2026-11" },
			F,
		);
		expect(cell).toMatchObject({ year: "2025", past: true });
	});
});

describe("calendarItems and calendarTitle on golden (BR-F05-38)", () => {
	const forMonth = (month: string, charges: Parameters<typeof calendarItems>[1]) =>
		calendarItems(goldenItems(), charges, month, "2026-11-02");

	// AC-F05-38
	test("November: the 1 Nov charge, then Netflix's and Cult Gym's due dates", () => {
		const items = forMonth("2026-11", NOVEMBER);
		expect(
			items.map((each) => [each.date, each.kind, each.name, each.amountMinor]),
		).toEqual([
			["2026-11-01", "charged", "Sunrise Apartments", 1800000],
			["2026-11-05", "due", "Netflix", 64900],
			["2026-11-10", "due", "Cult Gym", 150000],
		]);
	});

	test("October: three charges and Cult Gym's skipped 10 Oct", () => {
		const items = forMonth("2026-10", OCTOBER);
		expect(items.map((each) => [each.date, each.kind, each.name])).toEqual([
			["2026-10-01", "charged", "Sunrise Apartments"],
			["2026-10-05", "charged", "Netflix"],
			["2026-10-10", "skipped", "Cult Gym"],
			["2026-10-12", "charged", "Amazon Prime"],
		]);
	});

	test("December: three due dates", () => {
		const items = forMonth("2026-12", []);
		expect(items.map((each) => [each.date, each.kind, each.name])).toEqual([
			["2026-12-01", "due", "Sunrise Apartments"],
			["2026-12-05", "due", "Netflix"],
			["2026-12-10", "due", "Cult Gym"],
		]);
	});

	test("a charge of a deleted Subscription is there, named by its payee", () => {
		const orphan = charge({
			subscriptionId: null,
			subscription: null,
			payee: "Hotstar",
			category: "entertainment",
			occurredOn: "2026-11-01",
			dueOn: "2026-11-01",
			amountMinor: 29900,
		});
		const items = forMonth("2026-11", [...NOVEMBER, orphan]);
		expect(items.find((each) => each.name === "Hotstar")).toMatchObject({
			kind: "charged",
			subscriptionId: null,
			amountMinor: 29900,
		});
	});

	test("a paused date from today on is paused, and a skipped one skipped", () => {
		const items = calendarItems(
			[
				subscriptionItem("netflix", {
					pause: { from: "2026-11-05", until: "2027-01-05" },
					skips: ["2026-12-05"],
				}),
			],
			[],
			"2026-12",
			"2026-11-02",
		);
		expect(items.map((each) => each.kind)).toEqual(["skipped"]);
		const november = calendarItems(
			[
				subscriptionItem("netflix", {
					pause: { from: "2026-11-05", until: "2027-01-05" },
				}),
			],
			[],
			"2026-11",
			"2026-11-02",
		);
		expect(november.map((each) => each.kind)).toEqual(["paused"]);
	});

	test("an item's charge id comes with a charged item only", () => {
		const items = forMonth("2026-11", NOVEMBER);
		expect(items[0]!.chargeId).toBe(NOVEMBER[0]!.id);
		expect(items[1]!.chargeId).toBeNull();
	});

	test("a charge in another month is left out", () => {
		expect(
			forMonth("2026-11", OCTOBER).some((each) => each.kind === "charged"),
		).toBe(false);
	});

	test("a charge with no payee or category still draws", () => {
		const bare = charge({
			subscriptionId: null,
			subscription: null,
			payee: null,
			category: null,
			occurredOn: "2026-11-03",
			dueOn: "2026-11-03",
		});
		const items = forMonth("2026-11", [bare]);
		expect(items.find((each) => each.chargeId === bare.id)).toMatchObject({
			name: "",
			category: "",
		});
	});

	// AC-F05-38
	test("November reads 18,000.00 charged and 2,149.00 to come", () => {
		expect(calendarTitle("2026-11", forMonth("2026-11", NOVEMBER), F)).toEqual({
			title: "November 2026",
			figures: "₹18,000.00 charged · ₹2,149.00 to come",
		});
	});

	test("October reads 20,148.00 charged", () => {
		expect(calendarTitle("2026-10", forMonth("2026-10", OCTOBER), F)).toEqual({
			title: "October 2026",
			figures: "₹20,148.00 charged",
		});
	});

	test("December reads 20,149.00 expected, at today's prices", () => {
		expect(calendarTitle("2026-12", forMonth("2026-12", []), F)).toEqual({
			title: "December 2026",
			figures: "₹20,149.00 expected, at today's prices",
		});
	});

	test("a skipped or paused item adds to neither figure", () => {
		const items = calendarItems(
			[subscriptionItem("cultGym")],
			[],
			"2026-10",
			"2026-11-02",
		);
		expect(calendarTitle("2026-10", items, F).figures).toBe("₹0.00 charged");
	});

	test("the title follows the date locale", () => {
		expect(
			calendarTitle("2026-11", [], { ...F, dateLocale: "de-DE" }).title,
		).toBe("November 2026");
		expect(calendarTitle("2026-09", [], F).title).toBe("September 2026");
	});
});

describe("an item's words (BR-F05-38)", () => {
	test("the word for each kind", () => {
		expect(itemWord("charged")).toBe("charged");
		expect(itemWord("due")).toBe("due");
		expect(itemWord("skipped")).toBe("skipped");
		expect(itemWord("paused")).toBe("paused");
		expect(itemWord("pending")).toBe("pending sync");
	});

	test("only skipped and paused items are struck", () => {
		expect(
			(["charged", "due", "skipped", "paused", "pending"] as const).map(
				isStruck,
			),
		).toEqual([false, false, true, true, false]);
	});

	test("charged and due items make up a total, the rest do not", () => {
		expect(
			countedMinor([
				item("charged", "2026-11-01", "A", 100),
				item("due", "2026-11-01", "B", 20),
				item("skipped", "2026-11-01", "C", 3000),
				item("paused", "2026-11-01", "D", 40000),
				item("pending", "2026-11-01", "E", 500000),
			]),
		).toBe(120);
		expect(countedMinor([])).toBe(0);
	});

	test("a chip is named by its name, amount and state", () => {
		expect(chipLabel(item("due", "2026-11-05", "Netflix", 64900), F)).toBe(
			"Netflix, ₹649.00, due",
		);
		expect(
			chipLabel(
				item("charged", "2026-11-01", "Sunrise Apartments", 1800000),
				F,
			),
		).toBe("Sunrise Apartments, ₹18,000.00, charged");
		expect(chipLabel(item("skipped", "2026-10-10", "Cult Gym", 150000), F)).toBe(
			"Cult Gym, ₹1,500.00, skipped",
		);
	});

	test("a chip's amount is in whole units", () => {
		expect(chipAmount(item("due", "2026-11-05", "Netflix", 64900), F)).toBe(
			"₹649",
		);
		expect(chipAmount(item("due", "2027-10-12", "Prime", 12492), F)).toBe(
			"₹125",
		);
	});
});

describe("weekdayHeaders (BR-F05-38)", () => {
	test("from the week start, in the locale's short names", () => {
		expect(weekdayHeaders("monday", F)).toEqual([
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
			"Sat",
			"Sun",
		]);
		expect(weekdayHeaders("sunday", F)).toEqual([
			"Sun",
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
			"Sat",
		]);
		expect(weekdayHeaders("saturday", F)).toEqual([
			"Sat",
			"Sun",
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
		]);
	});

	test("follows the date locale", () => {
		expect(weekdayHeaders("monday", { ...F, dateLocale: "de-DE" })[0]).toBe(
			"Mo",
		);
	});
});

describe("gridWeeks (BR-F05-38)", () => {
	const november = () =>
		calendarItems(goldenItems(), NOVEMBER, "2026-11", "2026-11-02");
	const weeks = (start: WeekStart = "monday") =>
		gridWeeks("2026-11", start, november(), F);

	// AC-F05-38
	test("November from a Monday start is six weeks, from 26 Oct to 6 Dec", () => {
		const grid = weeks();
		expect(grid.map((week) => week.key)).toEqual([
			"2026-10-26",
			"2026-11-02",
			"2026-11-09",
			"2026-11-16",
			"2026-11-23",
			"2026-11-30",
		]);
		expect(grid[0]!.days[0]!.date).toBe("2026-10-26");
		expect(grid.at(-1)!.days.at(-1)!.date).toBe("2026-12-06");
	});

	test("week totals: the 1 Nov charge, Netflix, Cult Gym, and a dash for the others", () => {
		expect(weeks().map((week) => week.total)).toEqual([
			"₹18,000.00",
			"₹649.00",
			"₹1,500.00",
			"—",
			"—",
			"—",
		]);
		expect(weeks().map((week) => week.totalMinor)).toEqual([
			1800000, 64900, 150000, 0, 0, 0,
		]);
	});

	test("days outside the month are dimmed, empty, and 1 Dec reads in full", () => {
		const grid = weeks();
		const first = grid[0]!.days;
		expect(first.slice(0, 6).map((day) => day.inMonth)).toEqual(
			Array(6).fill(false),
		);
		expect(first.slice(0, 6).map((day) => day.label)).toEqual([
			"26",
			"27",
			"28",
			"29",
			"30",
			"31",
		]);
		expect(first[6]).toMatchObject({
			date: "2026-11-01",
			inMonth: true,
			label: "1",
		});
		const last = grid.at(-1)!.days;
		expect(last.map((day) => day.label)).toEqual([
			"30",
			"1 Dec",
			"2",
			"3",
			"4",
			"5",
			"6",
		]);
		expect(
			last.slice(1).every((day) => !day.inMonth && day.items.length === 0),
		).toBe(true);
	});

	test("marks today, and every day before it as past", () => {
		const days = weeks().flatMap((week) => week.days);
		expect(days.filter((day) => day.today).map((day) => day.date)).toEqual([
			"2026-11-02",
		]);
		expect(
			days.filter((day) => day.past).every((day) => day.date < "2026-11-02"),
		).toBe(true);
		expect(
			days
				.filter((day) => !day.past && !day.today)
				.every((day) => day.date > "2026-11-02"),
		).toBe(true);
	});

	test("puts each item on its day", () => {
		const days = weeks().flatMap((week) => week.days);
		expect(
			days
				.find((day) => day.date === "2026-11-01")!
				.items.map((each) => each.name),
		).toEqual(["Sunrise Apartments"]);
		expect(
			days
				.find((day) => day.date === "2026-11-05")!
				.items.map((each) => each.name),
		).toEqual(["Netflix"]);
		expect(
			days
				.find((day) => day.date === "2026-11-10")!
				.items.map((each) => each.name),
		).toEqual(["Cult Gym"]);
	});

	test("a Sunday start has five weeks, a Saturday start five from 31 Oct", () => {
		expect(weeks("sunday").map((week) => week.key)).toEqual([
			"2026-11-01",
			"2026-11-08",
			"2026-11-15",
			"2026-11-22",
			"2026-11-29",
		]);
		expect(weeks("saturday").map((week) => week.key)).toEqual([
			"2026-10-31",
			"2026-11-07",
			"2026-11-14",
			"2026-11-21",
			"2026-11-28",
		]);
	});

	test("a month that fills its weeks exactly has no day outside it", () => {
		const grid = gridWeeks("2026-02", "sunday", [], F);
		expect(grid).toHaveLength(4);
		expect(grid.flatMap((week) => week.days).every((day) => day.inMonth)).toBe(
			true,
		);
	});

	test("February in a leap year has its 29th", () => {
		const days = gridWeeks("2028-02", "monday", [], F).flatMap(
			(week) => week.days,
		);
		expect(days.filter((day) => day.inMonth)).toHaveLength(29);
	});

	test.each(["monday", "sunday", "saturday"] as const)(
		"%s start: every month of three years is whole weeks, from the start day, with no gap",
		(start) => {
			for (let n = 0; n < 36; n += 1) {
				const month = `${2026 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
				const days = gridWeeks(month, start, [], F).flatMap(
					(week) => week.days,
				);
				expect(days.length % 7).toBe(0);
				const wanted = { sunday: 0, monday: 1, saturday: 6 }[start];
				expect(weekdayIndex(days[0]!.date)).toBe(wanted);
				for (let i = 1; i < days.length; i += 1) {
					const gap =
						(Date.parse(`${days[i]!.date}T00:00:00Z`)
							- Date.parse(`${days[i - 1]!.date}T00:00:00Z`))
						/ 86_400_000;
					expect(gap).toBe(1);
				}
				expect(days.filter((day) => day.inMonth)).toHaveLength(
					new Date(
						Date.UTC(
							Number(month.slice(0, 4)),
							Number(month.slice(5)),
							0,
						),
					).getUTCDate(),
				);
			}
		},
	);

	describe("a day's items (BR-F05-38)", () => {
		const day = (items: MonthItem[]) =>
			gridWeeks("2026-11", "monday", items, F)
				.flatMap((week) => week.days)
				.find((each) => each.date === "2026-11-05")!;
		const netflix = item("due", "2026-11-05", "Netflix", 64900);
		const gym = item("due", "2026-11-05", "Cult Gym", 150000, "health");
		const rent = item(
			"due",
			"2026-11-05",
			"Sunrise Apartments",
			1800000,
			"housing",
		);

		test("one or two items are all shown", () => {
			expect(day([netflix]).shown).toEqual([netflix]);
			expect(day([netflix, gym]).shown).toEqual([netflix, gym]);
			expect(day([netflix, gym]).moreText).toBeNull();
			expect(day([netflix, gym]).moreCount).toBe(0);
		});

		test("three show the first and +2 more with the day's total in whole units", () => {
			const crowded = day([rent, gym, netflix]);
			expect(crowded.shown).toEqual([rent]);
			expect(crowded.moreCount).toBe(2);
			expect(crowded.moreText).toBe("+2 more · ₹20,149");
			expect(crowded.items).toHaveLength(3);
			expect(crowded.totalMinor).toBe(2014900);
		});

		test("four show +3 more", () => {
			expect(
				day([rent, gym, netflix, item("charged", "2026-11-05", "X", 100)])
					.moreText,
			).toMatch(/^\+3 more · /);
		});

		test("a day with no item is empty", () => {
			const empty = gridWeeks("2026-11", "monday", [], F)
				.flatMap((week) => week.days)
				.find((each) => each.date === "2026-11-05")!;
			expect(empty).toMatchObject({
				items: [],
				shown: [],
				moreCount: 0,
				totalMinor: 0,
				moreText: null,
			});
		});

		test("the total counts charged and due, not skipped or paused", () => {
			const mixed = day([
				netflix,
				item("skipped", "2026-11-05", "A", 5000),
				item("paused", "2026-11-05", "B", 7000),
			]);
			expect(mixed.totalMinor).toBe(64900);
			expect(mixed.moreText).toMatch(/^\+2 more · ₹649$/);
		});

		test("an item dated outside the month is not drawn on that day", () => {
			const grid = gridWeeks(
				"2026-11",
				"monday",
				[
					item("charged", "2026-10-31", "Stray", 10000),
					item("due", "2026-12-01", "Stray", 10000),
				],
				F,
			).flatMap((week) => week.days);
			expect(grid.find((each) => each.date === "2026-10-31")!.items).toEqual(
				[],
			);
			expect(grid.find((each) => each.date === "2026-12-01")!.items).toEqual(
				[],
			);
		});

		test("the week total counts the month's own days only", () => {
			const grid = gridWeeks(
				"2026-11",
				"monday",
				[
					item("charged", "2026-10-30", "Stray", 10000),
					item("charged", "2026-11-01", "Own", 20000),
				],
				F,
			);
			expect(grid[0]!.total).toBe("₹200.00");
		});

		test("a week with only skipped items has no total", () => {
			const grid = gridWeeks(
				"2026-11",
				"monday",
				[item("skipped", "2026-11-05", "A", 5000)],
				F,
			);
			expect(grid[1]!.total).toBe("—");
		});
	});

	test("the dates follow the locale", () => {
		const grid = gridWeeks("2026-11", "monday", [], {
			...F,
			dateLocale: "en-US",
		});
		expect(grid.at(-1)!.days[1]!.label).toBe("Dec 1");
	});
});

describe("dayPopover (BR-F05-38)", () => {
	const items = [
		item("due", "2026-11-05", "Netflix", 64900, "entertainment"),
		item("due", "2026-11-05", "Cult Gym", 150000, "health"),
		item("charged", "2026-11-05", "Sunrise Apartments", 1800000, "housing"),
	];
	const day = { date: "2026-11-05", items, totalMinor: 2014900 };

	// AC-F05-38
	test("names the day, totals it, and lists each item with its category and state", () => {
		const popover = dayPopover(day, F);
		expect(popover.title).toBe("Thu, 5 Nov");
		expect(popover.total).toBe("₹20,149.00");
		expect(
			popover.entries.map((entry) => [
				entry.item.name,
				entry.caption,
				entry.amount,
			]),
		).toEqual([
			["Netflix", "Entertainment · due", "₹649.00"],
			["Cult Gym", "Health · due", "₹1,500.00"],
			["Sunrise Apartments", "Housing · charged", "₹18,000.00"],
		]);
	});

	test("a skipped item reads its state", () => {
		const popover = dayPopover(
			{
				date: "2026-11-05",
				items: [item("skipped", "2026-11-05", "A", 100, "food")],
				totalMinor: 0,
			},
			F,
		);
		expect(popover.entries[0]!.caption).toBe("Food · skipped");
		expect(popover.total).toBe("₹0.00");
	});

	test("a category it does not know is written as it is", () => {
		const popover = dayPopover(
			{
				date: "2026-11-05",
				items: [item("due", "2026-11-05", "A", 100, "mystery")],
				totalMinor: 100,
			},
			F,
		);
		expect(popover.entries[0]!.caption).toBe("mystery · due");
	});

	test("the title keeps the year outside the current one", () => {
		expect(
			dayPopover({ date: "2027-01-05", items: [], totalMinor: 0 }, F).title,
		).toBe("Tue, 5 Jan, 2027");
	});
});

describe("phoneWeeks on golden (BR-F05-38)", () => {
	const november = () =>
		calendarItems(goldenItems(), NOVEMBER, "2026-11", "2026-11-02");
	const weeks = (start: WeekStart = "monday", f = F) =>
		phoneWeeks("2026-11", start, november(), f);

	// AC-F05-38
	test("November's weeks from a Monday start are cut at the month's ends", () => {
		expect(weeks().map((week) => week.label)).toEqual([
			"1 Nov",
			"2 to 8 Nov",
			"9 to 15 Nov",
			"16 to 22 Nov",
			"23 to 29 Nov",
			"30 Nov",
		]);
	});

	test("each week's total, and none for a week with nothing counted", () => {
		expect(weeks().map((week) => week.total)).toEqual([
			"₹18,000.00",
			"₹649.00",
			"₹1,500.00",
			null,
			null,
			null,
		]);
		expect(weeks().map((week) => week.hasItems)).toEqual([
			true,
			true,
			true,
			false,
			false,
			false,
		]);
	});

	test("the week of 2 to 8 Nov: today, two single days, Netflix, and a run", () => {
		const rows = weeks()[1]!.rows;
		expect(rows.map((row) => row.kind)).toEqual([
			"empty",
			"empty",
			"empty",
			"items",
			"run",
		]);
		expect(rows[0]).toMatchObject({
			date: "2026-11-02",
			today: true,
			label: "Today",
		});
		expect(rows[1]).toMatchObject({
			date: "2026-11-03",
			today: false,
			label: "Tue 3",
		});
		expect(rows[2]).toMatchObject({ label: "Wed 4" });
		const netflix = rows[3]!;
		expect(netflix).toMatchObject({
			kind: "items",
			date: "2026-11-05",
			label: "Thu 5",
			today: false,
		});
		expect(
			(
				netflix as {
					entries: {
						item: MonthItem;
						caption: string;
						amount: string;
						struck: boolean;
					}[];
				}
			).entries,
		).toEqual([
			{
				item: expect.objectContaining({ name: "Netflix" }),
				caption: "in 3 days",
				amount: "₹649.00",
				struck: false,
			},
		]);
		expect(rows[4]).toEqual({
			kind: "run",
			from: "2026-11-06",
			to: "2026-11-08",
			label: "Fri 6 to Sun 8",
		});
	});

	test("the week of 9 to 15 Nov: a single day, Cult Gym, and a run of five", () => {
		const rows = weeks()[2]!.rows;
		expect(rows.map((row) => row.kind)).toEqual(["empty", "items", "run"]);
		expect(rows[0]).toMatchObject({ label: "Mon 9" });
		expect(rows[1]).toMatchObject({ kind: "items", label: "Tue 10" });
		expect(rows[2]).toMatchObject({ kind: "run", label: "Wed 11 to Sun 15" });
	});

	test("the 1 Nov week is one day with a charge", () => {
		const [week] = weeks();
		expect(week!.rows).toHaveLength(1);
		expect(week!.rows[0]).toMatchObject({ kind: "items", label: "Sun 1" });
		expect(
			(week!.rows[0] as { entries: { caption: string }[] }).entries[0]!
				.caption,
		).toBe("Charged");
	});

	test("a Sunday start cuts the weeks differently", () => {
		expect(weeks("sunday").map((week) => week.label)).toEqual([
			"1 to 7 Nov",
			"8 to 14 Nov",
			"15 to 21 Nov",
			"22 to 28 Nov",
			"29 to 30 Nov",
		]);
	});

	test("every day of the month is in exactly one row, a run's days included", () => {
		const covered = weeks().flatMap((week) =>
			week.rows.flatMap((row) => {
				if (row.kind !== "run") return [row.date];
				const days: string[] = [];
				for (
					let day = Number(row.from.slice(8));
					day <= Number(row.to.slice(8));
					day += 1
				) {
					days.push(`2026-11-${String(day).padStart(2, "0")}`);
				}
				return days;
			}),
		);
		expect(covered).toHaveLength(30);
		expect(new Set(covered).size).toBe(30);
	});

	test("an en-US label writes the month first, both ends in full", () => {
		expect(weeks("monday", { ...F, dateLocale: "en-US" })[1]!.label).toBe(
			"Nov 2 to Nov 8",
		);
	});
});

describe("empty weeks and today (BR-F05-38)", () => {
	const november = () =>
		calendarItems(goldenItems(), NOVEMBER, "2026-11", "2026-11-02");

	// AC-F05-38
	test("a week with no item reads Nothing due · Show days and shows nothing", () => {
		const [, , , empty] = phoneWeeks("2026-11", "monday", november(), F);
		expect(empty!.hasItems).toBe(false);
		expect(phoneWeekHint(empty!, false)).toBe("Nothing due · Show days");
		expect(phoneRows(empty!, false)).toEqual([]);
	});

	test("once opened, it shows its days and drops the hint", () => {
		const [, , , empty] = phoneWeeks("2026-11", "monday", november(), F);
		expect(phoneWeekHint(empty!, true)).toBeNull();
		expect(phoneRows(empty!, true)).toEqual(empty!.rows);
		expect(empty!.rows).toEqual([
			{
				kind: "run",
				from: "2026-11-16",
				to: "2026-11-22",
				label: "Mon 16 to Sun 22",
			},
		]);
	});

	test("a week with items has no hint and shows every row", () => {
		const [, withNetflix] = phoneWeeks("2026-11", "monday", november(), F);
		expect(phoneWeekHint(withNetflix!, false)).toBeNull();
		expect(phoneRows(withNetflix!, false)).toEqual(withNetflix!.rows);
	});

	// BR-F05-38: today always shows, even in a week with no item.
	test("today still shows in a week with no item, with the hint beside it", () => {
		const week = phoneWeeks("2026-11", "monday", november(), {
			...F,
			today: "2026-11-18",
		})[3]!;
		expect(week.hasItems).toBe(false);
		expect(phoneRows(week, false)).toEqual([
			{ kind: "empty", date: "2026-11-18", today: true, label: "Today" },
		]);
		expect(phoneWeekHint(week, false)).toBe("Nothing due · Show days");
	});

	test("around today the days are single lines or runs by how many there are", () => {
		const week = phoneWeeks("2026-11", "monday", november(), {
			...F,
			today: "2026-11-18",
		})[3]!;
		expect(
			week.rows.map((row) => (row.kind === "run" ? row.label : row.label)),
		).toEqual(["Mon 16", "Tue 17", "Today", "Thu 19 to Sun 22"]);
	});

	test("two empty days in a row stay two lines, three become one", () => {
		const base = (date: string) => item("due", date, "X", 100);
		const two = phoneWeeks("2026-11", "monday", [base("2026-11-05")], {
			...F,
			today: "2026-12-01",
		})[1]!;
		// 2, 3, 4 are three empty days before the item.
		expect(two.rows[0]).toMatchObject({ kind: "run", label: "Mon 2 to Wed 4" });
		const only2 = phoneWeeks("2026-11", "monday", [base("2026-11-04")], {
			...F,
			today: "2026-12-01",
		})[1]!;
		expect(only2.rows.slice(0, 2).map((row) => row.kind)).toEqual([
			"empty",
			"empty",
		]);
	});

	test("a week of one day with no item has one line", () => {
		const week = phoneWeeks("2026-11", "monday", [], F)[5]!;
		expect(week.label).toBe("30 Nov");
		expect(week.rows).toEqual([
			{ kind: "empty", date: "2026-11-30", today: false, label: "Mon 30" },
		]);
	});

	describe("a week of only skipped or paused items", () => {
		const items = [
			item("skipped", "2026-11-05", "Cult Gym", 150000, "health"),
			item("paused", "2026-11-06", "Netflix", 64900),
		];
		const week = () => phoneWeeks("2026-11", "monday", items, F)[1]!;

		test("shows them, with no total and no Nothing due", () => {
			expect(week().hasItems).toBe(true);
			expect(week().total).toBeNull();
			expect(week().totalMinor).toBe(0);
			expect(phoneWeekHint(week(), false)).toBeNull();
			expect(phoneRows(week(), false)).toEqual(week().rows);
		});

		test("their captions say so, and they are struck", () => {
			const entries = week()
				.rows.filter((row) => row.kind === "items")
				.flatMap(
					(row) =>
						(row as { entries: { caption: string; struck: boolean }[] })
							.entries,
				);
			expect(entries.map((entry) => [entry.caption, entry.struck])).toEqual([
				["Skipped", true],
				["Paused", true],
			]);
		});
	});

	test("captions by kind: a due item reads its relative date, the others their state", () => {
		const items = [
			item("charged", "2026-11-01", "A", 100),
			item("due", "2026-11-03", "B", 100),
			item("skipped", "2026-11-04", "C", 100),
			item("paused", "2026-11-05", "D", 100),
			item("pending", "2026-11-06", "E", 100),
		];
		const captions = phoneWeeks("2026-11", "monday", items, F)
			.flatMap((week) => week.rows)
			.filter((row) => row.kind === "items")
			.flatMap((row) =>
				(row as { entries: { caption: string }[] }).entries.map(
					(e) => e.caption,
				),
			);
		expect(captions).toEqual([
			"Charged",
			"tomorrow",
			"Skipped",
			"Paused",
			"Pending sync",
		]);
	});

	test("two items on one day share one row, in order", () => {
		const rows = phoneWeeks(
			"2026-11",
			"monday",
			[
				item("due", "2026-11-05", "Big", 900),
				item("due", "2026-11-05", "Small", 100),
			],
			F,
		)[1]!.rows.filter((row) => row.kind === "items");
		expect(rows).toHaveLength(1);
		expect(
			(rows[0] as { entries: { item: MonthItem }[] }).entries.map(
				(entry) => entry.item.name,
			),
		).toEqual(["Big", "Small"]);
	});

	test("today with items reads Today, not its weekday", () => {
		const rows = phoneWeeks(
			"2026-11",
			"monday",
			[item("due", "2026-11-02", "X", 100)],
			F,
		)[1]!.rows;
		expect(rows[0]).toMatchObject({
			kind: "items",
			today: true,
			label: "Today",
		});
	});

	test("the weeks are those of any month: every day once, from every week start", () => {
		for (const start of ["monday", "sunday", "saturday"] as const) {
			for (const month of ["2026-02", "2028-02", "2026-12", "2027-03"]) {
				const weeks = phoneWeeks(month, start, [], {
					...F,
					today: "2026-11-02",
				});
				const days = weeks.reduce((sum, week) => {
					return (
						sum
						+ week.rows.reduce((inner, row) => {
							if (row.kind !== "run") return inner + 1;
							return (
								inner
								+ (Number(row.to.slice(8))
									- Number(row.from.slice(8))
									+ 1)
							);
						}, 0)
					);
				}, 0);
				expect(days).toBe(
					new Date(
						Date.UTC(
							Number(month.slice(0, 4)),
							Number(month.slice(5)),
							0,
						),
					).getUTCDate(),
				);
			}
		}
	});
});

describe("the months the row reads (BR-F05-36, BR-F05-38)", () => {
	test("the reach is 120 months", () => {
		expect(MONTH_REACH).toBe(120);
	});

	test("a read covers the widest window, 8 months from 3 before the current one", () => {
		expect(monthSpan("2026-11", 0)).toEqual({ from: "2026-08", to: "2027-03" });
	});

	test("a read follows the row's offset", () => {
		expect(monthSpan("2026-11", 3)).toEqual({ from: "2026-11", to: "2027-06" });
		expect(monthSpan("2026-11", -6)).toEqual({ from: "2026-02", to: "2026-09" });
	});

	test("a read is 8 months, under the API's span of 24", () => {
		const { from, to } = monthSpan("2026-11", 0);
		expect(monthWindow("2026-11", 0, MONTHS_MAX)).toHaveLength(8);
		expect(from).toBe(monthWindow("2026-11", 0, MONTHS_MAX)[0]);
		expect(to).toBe(monthWindow("2026-11", 0, MONTHS_MAX).at(-1));
	});

	test("every narrower window lies inside the read, at any offset", () => {
		for (const offset of [-9, 0, 3, 12]) {
			const { from, to } = monthSpan("2026-11", offset);
			for (const count of [4, 5, 6, 7]) {
				for (const month of monthWindow("2026-11", offset, count)) {
					expect(month >= from && month <= to).toBe(true);
				}
			}
		}
	});

	test("both arrows work at first", () => {
		expect(canMoveMonths("2026-11", 0, -1)).toBe(true);
		expect(canMoveMonths("2026-11", 0, 1)).toBe(true);
	});

	test("Earlier months stops when its first month would be over 120 months back", () => {
		// The read's first month is 3 before the anchor: one step from -114 reaches 120 back,
		// still allowed; the next step is 123 back.
		expect(canMoveMonths("2026-11", -114, -1)).toBe(true);
		expect(canMoveMonths("2026-11", -117, -1)).toBe(false);
	});

	test("Later months stops when its last month would be over 120 months ahead", () => {
		// The read's last month is 4 after the anchor: 111 moves to 114, whose last is 118 ahead,
		// allowed; 114 moves to 117, whose last is 121.
		expect(canMoveMonths("2026-11", 111, 1)).toBe(true);
		expect(canMoveMonths("2026-11", 114, 1)).toBe(false);
	});

	test("the edge month itself is allowed", () => {
		expect(monthSpan("2026-11", -117).from).toBe("2016-11");
		expect(canMoveMonths("2026-11", -114, -1)).toBe(true);
	});
});

describe("monthCells with no figures (BR-F05-38)", () => {
	const months = ["2026-10", "2026-11", "2026-12"];
	const cells = () =>
		monthCells(
			months,
			undefined,
			{ current: "2026-11", selected: "2026-11" },
			F,
		);

	test("each month is named by its month alone", () => {
		expect(cells().map((cell) => cell.label)).toEqual([
			"October 2026",
			"November 2026",
			"December 2026",
		]);
	});

	test("each figure is a dash and none is known", () => {
		expect(cells().map((cell) => cell.figure)).toEqual(["—", "—", "—"]);
		expect(cells().map((cell) => cell.hasFigure)).toEqual([false, false, false]);
	});

	test("the current month has no bar", () => {
		expect(cells().map((cell) => cell.chargedTenths)).toEqual([
			null,
			null,
			null,
		]);
	});

	test("the marks that need no figure stay", () => {
		expect(cells().map((cell) => cell.past)).toEqual([true, false, false]);
		expect(cells().map((cell) => cell.current)).toEqual([false, true, false]);
		expect(cells().map((cell) => cell.selected)).toEqual([false, true, false]);
	});

	test("with figures every cell has one, even a month the answer lacks", () => {
		const known = monthCells(
			months,
			[{ month: "2026-10", chargedMinor: 100, expectedMinor: 0 }],
			{ current: "2026-11", selected: "2026-11" },
			F,
		);
		expect(known.map((cell) => cell.hasFigure)).toEqual([true, true, true]);
	});
});

describe("chipColor (BR-F05-38)", () => {
	test("is the category's colour variable", () => {
		expect(chipColor("entertainment")).toBe("var(--cat-entertainment)");
	});

	test("turns underscores into dashes", () => {
		expect(chipColor("fees_taxes")).toBe("var(--cat-fees-taxes)");
	});
});
