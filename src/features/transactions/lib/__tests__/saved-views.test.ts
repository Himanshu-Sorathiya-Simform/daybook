import { describe, expect, test } from "vitest";

import { type SavedView, VIEW_MESSAGES } from "@/lib/transactions/views";
import { VIEW_TEXT } from "../messages";
import {
	checkViewName,
	isUnknownView,
	selectedView,
	viewFields,
	viewsNote,
	viewUrl,
} from "../saved-views";

// The golden clock's day (TST-3) and the golden profile's currency.
const AT = { today: "2026-11-02", currency: "INR" as const };
const DEFAULT_LIST = { sort: "date", dir: "desc", group: "day" } as const;

/** F03 section 15's saved view: food, last month. */
const FOOD: SavedView = {
	id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02",
	name: "Food last month",
	filter: { range: "last_month", cat: ["food"] },
	sort: "date",
	dir: "desc",
	group: "day",
	version: 1,
	createdAt: "2026-11-02T06:30:00.000Z",
	updatedAt: "2026-11-02T06:30:00.000Z",
};
const OCTOBER_FOOD = {
	from: "2026-10-01",
	to: "2026-10-31",
	cat: ["food" as const],
};

describe("selectedView (BR-F03-65, BR-F03-66)", () => {
	test("no view selects All Transactions, not edited on its defaults", () => {
		expect(
			selectedView(null, [FOOD], { filter: {}, list: DEFAULT_LIST }, AT),
		).toEqual({ kind: "all", edited: false });
	});

	test("All Transactions is edited by any filter or list change", () => {
		expect(
			selectedView(
				null,
				[],
				{ filter: { q: "swiggy" }, list: DEFAULT_LIST },
				AT,
			),
		).toEqual({ kind: "all", edited: true });
		expect(
			selectedView(
				null,
				[],
				{ filter: {}, list: { ...DEFAULT_LIST, group: "payee" } },
				AT,
			),
		).toEqual({ kind: "all", edited: true });
	});

	// AC-F03-50
	test("a view of last_month and food on 2026-11-02 is not edited by October's dates", () => {
		expect(
			selectedView(
				FOOD.id,
				[FOOD],
				{ filter: OCTOBER_FOOD, list: DEFAULT_LIST },
				AT,
			),
		).toEqual({ kind: "saved", view: FOOD, edited: false });
	});

	// AC-F03-50
	test("adding type=expense or switching to group=payee makes it edited", () => {
		const typed = { filter: { ...OCTOBER_FOOD, type: ["expense" as const] } };
		expect(
			selectedView(FOOD.id, [FOOD], { ...typed, list: DEFAULT_LIST }, AT),
		).toMatchObject({ kind: "saved", edited: true });
		expect(
			selectedView(
				FOOD.id,
				[FOOD],
				{ filter: OCTOBER_FOOD, list: { ...DEFAULT_LIST, group: "payee" } },
				AT,
			),
		).toMatchObject({ kind: "saved", edited: true });
	});

	test("on another day the same dates are edited, since the preset moved", () => {
		expect(
			selectedView(
				FOOD.id,
				[FOOD],
				{ filter: OCTOBER_FOOD, list: DEFAULT_LIST },
				{ ...AT, today: "2026-12-01" },
			),
		).toMatchObject({ kind: "saved", edited: true });
	});

	test("a view id waits while the list has not loaded", () => {
		expect(
			selectedView(FOOD.id, undefined, { filter: {}, list: DEFAULT_LIST }, AT),
		).toEqual({ kind: "waiting" });
	});

	test("no view selects All Transactions also before the list loads", () => {
		expect(
			selectedView(null, undefined, { filter: {}, list: DEFAULT_LIST }, AT),
		).toEqual({ kind: "all", edited: false });
	});

	test("an id the loaded list lacks selects All Transactions, edited by the filter", () => {
		expect(
			selectedView(
				"0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c99",
				[FOOD],
				{ filter: OCTOBER_FOOD, list: DEFAULT_LIST },
				AT,
			),
		).toEqual({ kind: "all", edited: true });
	});
});

describe("isUnknownView (BR-F03-65)", () => {
	test("an id the loaded list lacks is unknown", () => {
		expect(isUnknownView("other", [FOOD])).toBe(true);
		expect(isUnknownView("other", [])).toBe(true);
	});

	test("an id in the list, no id, or a list still loading is not", () => {
		expect(isUnknownView(FOOD.id, [FOOD])).toBe(false);
		expect(isUnknownView(null, [FOOD])).toBe(false);
		expect(isUnknownView("other", undefined)).toBe(false);
	});
});

describe("viewUrl (BR-F03-65)", () => {
	test("a preset becomes its dates for today, with the view's list", () => {
		expect(viewUrl({ ...FOOD, group: "category" }, "2026-11-02")).toEqual({
			filter: OCTOBER_FOOD,
			list: { sort: "date", dir: "desc", group: "category" },
		});
	});

	// AC-F03-49
	test("a Last month view applied on 2027-01-15 writes December 2026", () => {
		expect(viewUrl(FOOD, "2027-01-15").filter).toEqual({
			from: "2026-12-01",
			to: "2026-12-31",
			cat: ["food"],
		});
	});

	// AC-F03-49: Last month from the first day of a month, across a year and a short February.
	test.each([
		["2027-01-01", "2026-12-01", "2026-12-31"],
		["2027-03-01", "2027-02-01", "2027-02-28"],
		["2028-03-01", "2028-02-01", "2028-02-29"],
	])("a Last month view applied on %s writes %s to %s", (today, from, to) => {
		expect(viewUrl(FOOD, today).filter).toEqual({ from, to, cat: ["food"] });
	});

	test("custom dates stay, and all time has none", () => {
		expect(
			viewUrl(
				{ ...FOOD, filter: { from: "2026-10-05", to: "2026-10-20" } },
				"2026-11-02",
			).filter,
		).toEqual({ from: "2026-10-05", to: "2026-10-20" });
		expect(viewUrl({ ...FOOD, filter: {} }, "2026-11-02").filter).toEqual({});
	});
});

describe("viewFields (BR-F03-67, BR-F03-68)", () => {
	test("dates that are a preset's today are saved as that preset", () => {
		expect(
			viewFields(
				{ filter: OCTOBER_FOOD, list: { ...DEFAULT_LIST, group: "payee" } },
				AT,
			),
		).toEqual({
			filter: { range: "last_month", cat: ["food"] },
			sort: "date",
			dir: "desc",
			group: "payee",
		});
	});

	test("other dates are saved as they are, and all time as neither", () => {
		expect(
			viewFields(
				{
					filter: { from: "2026-10-05", to: "2026-10-20" },
					list: DEFAULT_LIST,
				},
				AT,
			).filter,
		).toEqual({ from: "2026-10-05", to: "2026-10-20" });
		expect(viewFields({ filter: {}, list: DEFAULT_LIST }, AT).filter).toEqual(
			{},
		);
	});

	// BR-F03-64
	test("amount bounds bring the profile's currency", () => {
		expect(
			viewFields({ filter: { minMinor: 50000 }, list: DEFAULT_LIST }, AT),
		).toMatchObject({ filter: { minMinor: 50000 }, currency: "INR" });
		expect(
			viewFields({ filter: { maxMinor: 90000 }, list: DEFAULT_LIST }, AT),
		).toMatchObject({ filter: { maxMinor: 90000 }, currency: "INR" });
	});

	test("without amounts there is no currency", () => {
		expect(
			viewFields({ filter: { cat: ["food"] }, list: DEFAULT_LIST }, AT),
		).not.toHaveProperty("currency");
	});
});

describe("checkViewName (BR-F03-63)", () => {
	test("a name is stored trimmed", () => {
		expect(checkViewName("  Food in October  ", [])).toEqual({
			ok: true,
			name: "Food in October",
		});
	});

	test("an empty or blank name asks for one", () => {
		for (const text of ["", "   "]) {
			expect(checkViewName(text, [])).toEqual({
				ok: false,
				message: "Enter a name.",
			});
		}
	});

	test("40 characters pass and 41 are too many", () => {
		expect(checkViewName("a".repeat(40), [])).toMatchObject({ ok: true });
		expect(checkViewName("a".repeat(41), [])).toEqual({
			ok: false,
			message: "Use 40 characters or fewer.",
		});
	});

	test("40 emoji are 40 characters, as the database counts them", () => {
		expect(checkViewName("🍕".repeat(40), [])).toMatchObject({ ok: true });
	});

	test("a control character is refused", () => {
		expect(checkViewName("Food\u0007", [])).toEqual({
			ok: false,
			message: "Remove unsupported characters.",
		});
	});

	test("another view's name is taken in any case", () => {
		expect(checkViewName("food LAST month", ["Food last month"])).toEqual({
			ok: false,
			message: "You already have a view with this name.",
		});
	});

	// D-497: the browser lowercases as Postgres's lower() does
	test("names are compared as lower() compares them", () => {
		expect(checkViewName("İstanbul", ["istanbul"])).toMatchObject({
			ok: false,
		});
	});

	test("All Transactions is taken in any case", () => {
		expect(checkViewName("all TRANSACTIONS", [])).toEqual({
			ok: false,
			message: "You already have a view with this name.",
		});
	});

	test("a name no other view has passes", () => {
		expect(checkViewName("Food", ["Food last month"])).toEqual({
			ok: true,
			name: "Food",
		});
	});
});

describe("viewsNote (BR-F03-63, BR-F03-67)", () => {
	const ONLINE = { isOffline: false, atLimit: false };
	const OFFLINE = { isOffline: true, atLimit: false };
	const LIMIT = { isOffline: false, atLimit: true };

	test("a view id before the list has loaded has no note, offline or not", () => {
		expect(viewsNote({ kind: "waiting" }, ONLINE)).toBeNull();
		expect(viewsNote({ kind: "waiting" }, OFFLINE)).toBeNull();
		expect(
			viewsNote({ kind: "waiting" }, { isOffline: true, atLimit: true }),
		).toBeNull();
	});

	test("online with nothing to explain has no note", () => {
		expect(viewsNote({ kind: "all", edited: false }, ONLINE)).toBeNull();
		expect(viewsNote({ kind: "all", edited: true }, ONLINE)).toBeNull();
		expect(
			viewsNote({ kind: "saved", view: FOOD, edited: false }, ONLINE),
		).toBeNull();
		expect(
			viewsNote({ kind: "saved", view: FOOD, edited: true }, ONLINE),
		).toBeNull();
	});

	test("offline, an edited All Transactions says to connect", () => {
		expect(viewsNote({ kind: "all", edited: true }, OFFLINE)).toBe(
			VIEW_TEXT.offline,
		);
	});

	test("offline, a saved view says to connect, edited or not (its menu writes)", () => {
		expect(
			viewsNote({ kind: "saved", view: FOOD, edited: false }, OFFLINE),
		).toBe(VIEW_TEXT.offline);
		expect(viewsNote({ kind: "saved", view: FOOD, edited: true }, OFFLINE)).toBe(
			VIEW_TEXT.offline,
		);
	});

	test("offline, an unedited All Transactions offers no write, so no note", () => {
		expect(viewsNote({ kind: "all", edited: false }, OFFLINE)).toBeNull();
	});

	test("an edited All Transactions at 20 views gives the limit", () => {
		expect(viewsNote({ kind: "all", edited: true }, LIMIT)).toBe(
			VIEW_MESSAGES.limit,
		);
	});

	test("the limit shows only where Save as view does", () => {
		expect(viewsNote({ kind: "all", edited: false }, LIMIT)).toBeNull();
		expect(
			viewsNote({ kind: "saved", view: FOOD, edited: true }, LIMIT),
		).toBeNull();
	});

	test("offline wins over the limit", () => {
		expect(
			viewsNote(
				{ kind: "all", edited: true },
				{ isOffline: true, atLimit: true },
			),
		).toBe(VIEW_TEXT.offline);
	});
});
