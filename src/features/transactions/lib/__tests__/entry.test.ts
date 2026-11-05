import { describe, expect, test } from "vitest";

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import { isUuidV7, uuidV7Time } from "@/lib/ids";
import { TRANSACTION_MESSAGES } from "@/lib/transactions/schemas";
import {
	categoryTiles,
	changedFields,
	chargeNotice,
	checkEntry,
	counterOf,
	createBody,
	duplicateValues,
	editBody,
	editCalendarNote,
	ENTRY_TEXT,
	ENTRY_TITLES,
	type EntryLocale,
	type EntryValues,
	entryDateLabel,
	hasFixedDate,
	isChanged,
	modeValues,
	nextValues,
	rowValues,
	rowWindow,
	SERVER_FIELDS,
	startValues,
	tidyAmount,
	WINDOW_DAYS,
	windowStart,
} from "../entry";
import { DIALOG_FIELDS } from "../write-errors";
import { GOLDEN_CATEGORIES, row } from "./fixtures";

// The golden clock (TST-3): 2026-11-02 12:00 in Asia/Kolkata.
const NOW = new Date("2026-11-02T06:30:00.000Z");

const IN: EntryLocale = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

const DE: EntryLocale = {
	currency: "EUR",
	numberLocale: "de-DE-u-nu-latn",
	dateLocale: "de-DE",
	timezone: "Europe/Berlin",
};

/** A complete, valid expense on the golden day. */
const valid = (overrides: Partial<EntryValues> = {}): EntryValues => ({
	type: "expense",
	amount: "640.00",
	payee: "Swiggy",
	category: "food",
	date: "2026-11-02",
	time: "10:15",
	description: "",
	note: "",
	...overrides,
});

const fieldsOf = (values: EntryValues, locale = IN, now = NOW) => {
	const checked = checkEntry(values, locale, now);
	return checked.ok ? {} : checked.fields;
};

describe("startValues (BR-F03-07)", () => {
	test("an expense today at the current minute in the profile zone, with nothing else", () => {
		expect(startValues("Asia/Kolkata", NOW)).toEqual({
			type: "expense",
			amount: "",
			payee: "",
			category: null,
			date: "2026-11-02",
			time: "12:00",
			description: "",
			note: "",
		});
	});

	test("rounds the time down to the minute", () => {
		const late = new Date("2026-11-02T06:30:59.999Z");

		expect(startValues("Asia/Kolkata", late).time).toBe("12:00");
	});

	test("today and the time follow the profile zone, not the machine's", () => {
		expect(startValues("America/Los_Angeles", NOW)).toMatchObject({
			date: "2026-11-01",
			time: "22:30",
		});
	});

	test("just after midnight in the zone is the new day", () => {
		const after = new Date("2026-11-01T18:30:00.000Z");

		expect(startValues("Asia/Kolkata", after)).toMatchObject({
			date: "2026-11-02",
			time: "00:00",
		});
	});
});

describe("nextValues (BR-F03-21)", () => {
	test("keeps the type, date and time and empties the rest", () => {
		const saved = valid({
			type: "refund",
			date: "2026-10-30",
			time: "09:05",
			description: "Order",
			note: "Box",
		});

		expect(nextValues(saved)).toEqual({
			type: "refund",
			amount: "",
			payee: "",
			category: null,
			date: "2026-10-30",
			time: "09:05",
			description: "",
			note: "",
		});
	});
});

describe("isChanged (D-551)", () => {
	const start = startValues("Asia/Kolkata", NOW);

	test("is false while every field is where it started", () => {
		expect(isChanged({ ...start }, start)).toBe(false);
	});

	test.each([
		["type", { type: "income" }],
		["amount", { amount: "1" }],
		["payee", { payee: "S" }],
		["category", { category: "food" }],
		["date", { date: "2026-11-01" }],
		["time", { time: "11:59" }],
		["time cleared", { time: null }],
		["description", { description: " " }],
		["note", { note: "x" }],
	] as const)("is true after a change to the %s", (_name, change) => {
		expect(isChanged({ ...start, ...change }, start)).toBe(true);
	});

	test("is false again once a change is undone", () => {
		expect(isChanged({ ...start, amount: "" }, start)).toBe(false);
	});
});

describe("the entry window (BR-F03-08, TIME-7)", () => {
	test("is today and the 10 days before", () => {
		expect(WINDOW_DAYS).toBe(10);
		expect(windowStart("2026-11-02")).toBe("2026-10-23");
	});

	test("crosses a month and a year", () => {
		expect(windowStart("2026-01-05")).toBe("2025-12-26");
	});
});

describe("entryDateLabel (BR-F03-75)", () => {
	const locale = { today: "2026-11-02", dateLocale: "en-IN" };

	// AC-F03-62
	test("today reads Today, 2 Nov", () => {
		expect(entryDateLabel("2026-11-02", locale)).toBe("Today, 2 Nov");
	});

	test("yesterday reads Yesterday, 1 Nov", () => {
		expect(entryDateLabel("2026-11-01", locale)).toBe("Yesterday, 1 Nov");
	});

	test("an earlier day reads in F02's day format", () => {
		expect(entryDateLabel("2026-10-31", locale)).toBe("Sat, 31 Oct");
	});

	test("a day in another year adds the year", () => {
		expect(
			entryDateLabel("2025-12-31", {
				today: "2026-01-02",
				dateLocale: "en-IN",
			}),
		).toBe("Wed, 31 Dec, 2025");
	});

	test("yesterday across a year reads Yesterday with the day alone", () => {
		expect(
			entryDateLabel("2025-12-31", {
				today: "2026-01-01",
				dateLocale: "en-IN",
			}),
		).toBe("Yesterday, 31 Dec 2025");
	});

	test("follows the profile's date locale", () => {
		expect(
			entryDateLabel("2026-10-31", {
				today: "2026-11-02",
				dateLocale: "de-DE",
			}),
		).toBe("Sa., 31. Okt.");
		expect(
			entryDateLabel("2026-11-02", {
				today: "2026-11-02",
				dateLocale: "de-DE",
			}),
		).toBe("Today, 2. Nov.");
	});
});

describe("categoryTiles (BR-F03-75, D-550)", () => {
	// AC-F03-62
	test("Expense on golden data: the 6 used, then Utilities, then + 8 more", () => {
		expect(categoryTiles("expense", GOLDEN_CATEGORIES, null, false)).toEqual({
			tiles: [
				"food",
				"entertainment",
				"housing",
				"shopping",
				"transportation",
				"health",
				"utilities",
			],
			rest: 8,
		});
	});

	// AC-F03-62
	test("Income on golden data: all 5, and nothing more", () => {
		expect(categoryTiles("income", GOLDEN_CATEGORIES, null, false)).toEqual({
			tiles: ["salary", "freelance", "investments", "gifts", "other_income"],
			rest: 0,
		});
	});

	test("Refund takes the expense tiles", () => {
		expect(categoryTiles("refund", GOLDEN_CATEGORIES, null, false)).toEqual(
			categoryTiles("expense", GOLDEN_CATEGORIES, null, false),
		);
	});

	test("before the counts load, the first 7 in CAT order", () => {
		expect(categoryTiles("expense", undefined, null, false)).toEqual({
			tiles: EXPENSE_CATEGORIES.slice(0, 7),
			rest: 8,
		});
	});

	test("with more than 7 used, the 7 most used", () => {
		const used = EXPENSE_CATEGORIES.slice()
			.reverse()
			.map((key) => ({ key }));

		expect(categoryTiles("expense", used, null, false).tiles).toEqual(
			EXPENSE_CATEGORIES.slice().reverse().slice(0, 7),
		);
	});

	test("the chosen category joins the tiles when it is not among them", () => {
		expect(categoryTiles("expense", GOLDEN_CATEGORIES, "loans", false)).toEqual({
			tiles: [
				"food",
				"entertainment",
				"housing",
				"shopping",
				"transportation",
				"health",
				"utilities",
				"loans",
			],
			rest: 7,
		});
	});

	test("the chosen category among the tiles adds nothing", () => {
		expect(
			categoryTiles("expense", GOLDEN_CATEGORIES, "food", false).tiles,
		).toHaveLength(7);
	});

	test("a chosen category of another type is not shown", () => {
		expect(categoryTiles("income", GOLDEN_CATEGORIES, "food", false)).toEqual(
			categoryTiles("income", GOLDEN_CATEGORIES, null, false),
		);
	});

	test("expanded, the rest follow in CAT order and no tile shown moves", () => {
		const { tiles, rest } = categoryTiles(
			"expense",
			GOLDEN_CATEGORIES,
			null,
			true,
		);

		expect(tiles).toEqual([
			"food",
			"entertainment",
			"housing",
			"shopping",
			"transportation",
			"health",
			"utilities",
			"education",
			"travel",
			"insurance",
			"personal_care",
			"gifts_donations",
			"fees_taxes",
			"loans",
			"other",
		]);
		expect(rest).toBe(8);
	});

	// D-550: a choice made while the list is open never moves.
	test("expanded, a chosen tile outside the 7 keeps its place in CAT order", () => {
		expect(categoryTiles("expense", GOLDEN_CATEGORIES, "loans", true)).toEqual(
			categoryTiles("expense", GOLDEN_CATEGORIES, null, true),
		);
		expect(
			categoryTiles("expense", GOLDEN_CATEGORIES, "loans", true).tiles.indexOf(
				"loans",
			),
		).toBe(13);
	});

	test("expanded, + N more still counts what the 7 leave out, for Show fewer", () => {
		expect(categoryTiles("expense", GOLDEN_CATEGORIES, "loans", true).rest).toBe(
			8,
		);
	});

	test("income counts never become expense tiles", () => {
		const used = [{ key: "salary" as const }, { key: "food" as const }];

		expect(categoryTiles("expense", used, null, false).tiles[0]).toBe("food");
		expect(categoryTiles("expense", used, null, false).tiles).not.toContain(
			"salary",
		);
	});

	test("every income category shows at once", () => {
		expect(categoryTiles("income", [], null, false).tiles).toEqual(
			INCOME_CATEGORIES,
		);
	});
});

describe("counterOf (BR-F03-48)", () => {
	test("the payee's shows from 61 characters", () => {
		expect(counterOf("payee", "a".repeat(60))).toBeUndefined();
		expect(counterOf("payee", "a".repeat(61))).toBe("61 / 80");
		expect(counterOf("payee", "a".repeat(85))).toBe("85 / 80");
	});

	test("the description's shows from 91 characters", () => {
		expect(counterOf("description", "a".repeat(90))).toBeUndefined();
		expect(counterOf("description", "a".repeat(91))).toBe("91 / 120");
	});

	test("the note's always shows", () => {
		expect(counterOf("note", "")).toBe("0 / 500");
		expect(counterOf("note", "a\nb")).toBe("3 / 500");
	});

	test("counts code points, as the server does (D-230)", () => {
		expect(counterOf("payee", `${"a".repeat(59)}😀😀`)).toBe("61 / 80");
	});
});

describe("checkEntry: a valid entry (F03 section 8)", () => {
	test("answers the body's parts, the text trimmed and in NFC", () => {
		expect(
			checkEntry(
				valid({
					payee: "  Café  ",
					description: "  Lunch ",
					note: "Line 1\r\nLine 2",
				}),
				IN,
				NOW,
			),
		).toEqual({
			ok: true,
			amountMinor: 64000,
			payee: "Café",
			category: "food",
			time: "10:15",
			description: "Lunch",
			note: "Line 1\nLine 2",
		});
	});

	test("an empty or blank description and note become null", () => {
		expect(
			checkEntry(valid({ description: "   ", note: "" }), IN, NOW),
		).toMatchObject({
			ok: true,
			description: null,
			note: null,
		});
	});

	test("reads the amount in the user's format", () => {
		expect(checkEntry(valid({ amount: "1,23,456.50" }), IN, NOW)).toMatchObject({
			amountMinor: 12345650,
		});
		const berlin = new Date("2026-11-02T11:00:00.000Z");
		expect(checkEntry(valid({ amount: "1.240,50" }), DE, berlin)).toMatchObject({
			amountMinor: 124050,
		});
	});
});

describe("checkEntry: amount (BR-F03-04)", () => {
	test.each([
		["", "Enter an amount."],
		["abc", "Enter a number, like 1,240.50."],
		["0", "Enter an amount above zero."],
		["1.234", "Use at most 2 decimal places."],
		["1000000000", "The largest amount is 99,99,99,999.99."],
	])("%j gets %s", (amount, message) => {
		expect(fieldsOf(valid({ amount }))).toEqual({ amount: message });
	});

	test("12.50 in a comma-decimal profile names the right sign", () => {
		const berlin = new Date("2026-11-02T11:00:00.000Z");

		expect(fieldsOf(valid({ amount: "12.50" }), DE, berlin)).toEqual({
			amount: "Use , for decimals, like 12,50.",
		});
	});
});

describe("checkEntry: payee (BR-F03-12)", () => {
	test.each(["", "   ", "​"])("%j is required", (payee) => {
		expect(fieldsOf(valid({ payee }))).toEqual({
			payee: "Enter who you paid, or who paid you.",
		});
	});

	test("80 characters pass, 81 are too many", () => {
		expect(fieldsOf(valid({ payee: "a".repeat(80) }))).toEqual({});
		expect(fieldsOf(valid({ payee: "a".repeat(81) }))).toEqual({
			payee: "Use 80 characters or fewer.",
		});
	});

	test("a control character is refused", () => {
		expect(fieldsOf(valid({ payee: "Swi\u0007ggy" }))).toEqual({
			payee: "Remove unsupported characters.",
		});
	});

	test("a line break is refused", () => {
		expect(fieldsOf(valid({ payee: "Swi\nggy" }))).toEqual({
			payee: "Remove unsupported characters.",
		});
	});
});

describe("checkEntry: category (TXN-3)", () => {
	test("none chosen is refused", () => {
		expect(fieldsOf(valid({ category: null }))).toEqual({
			category: "Choose a category.",
		});
	});

	test("one of the other type is refused", () => {
		expect(fieldsOf(valid({ type: "income", category: "food" }))).toEqual({
			category: "Choose a category.",
		});
		expect(fieldsOf(valid({ type: "refund", category: "salary" }))).toEqual({
			category: "Choose a category.",
		});
	});

	test("an income category on income passes", () => {
		expect(fieldsOf(valid({ type: "income", category: "salary" }))).toEqual({});
	});
});

describe("checkEntry: date and time (BR-F03-08, BR-F03-09, D-540, D-549, D-551)", () => {
	test("the first day of the window passes, the day before it does not", () => {
		expect(fieldsOf(valid({ date: "2026-10-23" }))).toEqual({});
		expect(fieldsOf(valid({ date: "2026-10-22" }))).toEqual({
			date: "Choose today or one of the 10 days before.",
		});
	});

	test("a day after today is refused", () => {
		expect(fieldsOf(valid({ date: "2026-11-03" }))).toEqual({
			date: TRANSACTION_MESSAGES.dateOutOfWindow,
		});
	});

	test("a dialog left open past midnight refuses the day that left the window", () => {
		const nextDay = new Date("2026-11-02T18:31:00.000Z");

		expect(fieldsOf(valid({ date: "2026-10-23" }), IN, nextDay)).toEqual({
			date: "Choose today or one of the 10 days before.",
		});
	});

	test("today at the current minute passes, a minute later does not", () => {
		expect(fieldsOf(valid({ time: "12:00" }))).toEqual({});
		expect(fieldsOf(valid({ time: "12:01" }))).toEqual({
			time: "The time can't be in the future.",
		});
	});

	test("the seconds of now never push a time into the future", () => {
		const late = new Date("2026-11-02T06:30:59.000Z");

		expect(fieldsOf(valid({ time: "12:00" }), IN, late)).toEqual({});
	});

	test("an earlier day takes any time", () => {
		expect(fieldsOf(valid({ date: "2026-11-01", time: "23:59" }))).toEqual({});
	});

	test("today follows the profile zone", () => {
		// 22:30 on 1 Nov in Los Angeles: 2 Nov is tomorrow there.
		const la = { ...IN, timezone: "America/Los_Angeles" };

		expect(fieldsOf(valid({ date: "2026-11-02" }), la)).toEqual({
			date: "Choose today or one of the 10 days before.",
		});
		expect(fieldsOf(valid({ date: "2026-11-01", time: "22:31" }), la)).toEqual({
			time: "The time can't be in the future.",
		});
	});

	test("an emptied time gets Enter a time.", () => {
		expect(ENTRY_TEXT.timeRequired).toBe("Enter a time.");
		expect(fieldsOf(valid({ time: null }))).toEqual({ time: "Enter a time." });
	});
});

describe("checkEntry: description and note (BR-F03-12)", () => {
	test("120 description characters pass, 121 are too many", () => {
		expect(fieldsOf(valid({ description: "a".repeat(120) }))).toEqual({});
		expect(fieldsOf(valid({ description: "a".repeat(121) }))).toEqual({
			description: "Use 120 characters or fewer.",
		});
	});

	test("500 note characters pass, 501 are too many", () => {
		expect(fieldsOf(valid({ note: "a".repeat(500) }))).toEqual({});
		expect(fieldsOf(valid({ note: "a".repeat(501) }))).toEqual({
			note: "Use 500 characters or fewer.",
		});
	});

	test("a control character in either is refused", () => {
		expect(fieldsOf(valid({ description: "a\u0000", note: "b\u0001" }))).toEqual(
			{
				description: "Remove unsupported characters.",
				note: "Remove unsupported characters.",
			},
		);
	});

	test("a line break is refused in the description but kept in the note", () => {
		expect(fieldsOf(valid({ description: "a\nb", note: "a\nb" }))).toEqual({
			description: "Remove unsupported characters.",
		});
	});
});

describe("checkEntry: every field at once", () => {
	test("each field gets its own first message", () => {
		expect(
			fieldsOf({
				type: "expense",
				amount: "",
				payee: "",
				category: null,
				date: "2026-10-01",
				time: null,
				description: "a".repeat(121),
				note: "a".repeat(501),
			}),
		).toEqual({
			amount: "Enter an amount.",
			payee: "Enter who you paid, or who paid you.",
			category: "Choose a category.",
			date: "Choose today or one of the 10 days before.",
			time: "Enter a time.",
			description: "Use 120 characters or fewer.",
			note: "Use 500 characters or fewer.",
		});
	});

	test.each([
		["amount", { amount: "" }],
		["payee", { payee: "" }],
		["category", { category: null }],
		["date", { date: "2026-10-01" }],
		["time", { time: null }],
		["description", { description: "a".repeat(121) }],
		["note", { note: "a".repeat(501) }],
	] as const)("one bad %s alone fails the whole entry", (field, change) => {
		const checked = checkEntry(valid(change), IN, NOW);

		expect(checked.ok).toBe(false);
		expect(Object.keys(checked.ok ? {} : checked.fields)).toEqual([field]);
	});
});

describe("createBody (BR-F03-06, BR-F03-20)", () => {
	test("sends the create with a UUIDv7 and createdAt from now", () => {
		const values = valid({ description: " Lunch ", note: "" });
		const checked = checkEntry(values, IN, NOW);
		if (!checked.ok) throw new Error("expected a valid entry");

		const body = createBody(values, checked, IN, NOW);

		expect(body).toEqual({
			id: body.id,
			type: "expense",
			amountMinor: 64000,
			currency: "INR",
			occurredAt: "2026-11-02T04:45:00Z",
			occurredOn: "2026-11-02",
			createdAt: "2026-11-02T06:30:00.000Z",
			category: "food",
			goalId: null,
			payee: "Swiggy",
			description: "Lunch",
			note: null,
		});
		expect(isUuidV7(body.id)).toBe(true);
		expect(uuidV7Time(body.id)).toBe(NOW.getTime());
	});

	// AC-F03-08: the daylight-saving gap moves forward by the gap
	test("a time in a daylight-saving gap moves forward", () => {
		const ny = { ...IN, currency: "USD" as const, timezone: "America/New_York" };
		const now = new Date("2026-03-08T12:00:00.000Z");
		const values = valid({ amount: "6.40", date: "2026-03-08", time: "02:30" });
		const checked = checkEntry(values, ny, now);
		if (!checked.ok) throw new Error("expected a valid entry");

		expect(createBody(values, checked, ny, now)).toMatchObject({
			occurredAt: "2026-03-08T07:30:00Z",
			occurredOn: "2026-03-08",
			currency: "USD",
		});
	});

	test("each body gets its own id", () => {
		const values = valid();
		const checked = checkEntry(values, IN, NOW);
		if (!checked.ok) throw new Error("expected a valid entry");

		expect(createBody(values, checked, IN, NOW).id).not.toBe(
			createBody(values, checked, IN, NOW).id,
		);
	});
});

describe("tidyAmount (BR-F03-04)", () => {
	test.each([
		["1240.5", "1,240.50"],
		["123456", "1,23,456.00"],
		["  7 ", "7.00"],
	])("%j shows as %j after blur", (text, shown) => {
		expect(tidyAmount(text, IN)).toBe(shown);
	});

	test("a German amount keeps its own signs", () => {
		expect(tidyAmount("1240,5", DE)).toBe("1.240,50");
	});

	test.each(["", "abc", "0", "1.234"])(
		"%j, which is not an amount, stays as typed",
		(text) => {
			expect(tidyAmount(text, IN)).toBe(text);
		},
	);
});

describe("SERVER_FIELDS (BR-F03-48)", () => {
	test("puts each refused path under its field, and goalId under none until M2", () => {
		expect(SERVER_FIELDS).toEqual({
			type: "type",
			amountMinor: "amount",
			payee: "payee",
			category: "category",
			occurredOn: "date",
			occurredAt: "time",
			description: "description",
			note: "note",
		});
		expect(DIALOG_FIELDS.filter((path) => !(path in SERVER_FIELDS))).toEqual([
			"goalId",
		]);
	});
});

describe("ENTRY_TEXT (F03 section 8)", () => {
	test("holds the dialog's words", () => {
		expect(ENTRY_TEXT).toEqual({
			newTitle: "New Transaction",
			editTitle: "Edit Transaction",
			duplicateTitle: "Duplicate Transaction",
			saved: "Transaction saved.",
			changesSaved: "Changes saved.",
			auto: "Auto",
			chargeUnlinked:
				"From a deleted Subscription. Its type, date and time are fixed.",
			chargeLinked:
				"Its type, date and time are fixed; editing it stops the Subscription from changing this charge.",
			hidden: "Saved. It's hidden by your filters.",
			show: "Show",
			offline: "You are offline. Connect to save.",
			timeRequired: "Enter a time.",
			dateHint: "Today or one of the 10 days before.",
			calendarNote:
				"You can choose today or one of the 10 days before. Arrow keys move, Enter picks.",
			descriptionHint: "Shown under the payee in your list.",
			noteHint: "Only shown in the details. Line breaks are fine.",
			listHint: "Up and down to choose · Enter to select · Esc to close",
			discardTitle: "Discard changes?",
			discardBody: "What you've typed here won't be saved.",
		});
	});
});

// Golden #24 as the API answers it: Swiggy 640.00 on 19 Oct at 10:15 pm in Kolkata, recorded a
// minute later, so its own window runs from 9 Oct to 19 Oct.
const ROW_24 = row();
const LA: EntryLocale = { ...IN, timezone: "America/Los_Angeles" };
// Golden #26: Swiggy 420.00, stored on 1 Nov at 00:30 Kolkata time.
const ROW_26 = row({
	amountMinor: 42000,
	occurredOn: "2026-11-01",
	occurredAt: "2026-10-31T19:00:00.000Z",
	createdAt: "2026-10-31T19:00:00.000Z",
	updatedAt: "2026-10-31T19:00:00.000Z",
});

describe("ENTRY_TITLES (BR-F03-48)", () => {
	test("each mode's title", () => {
		expect(ENTRY_TITLES).toEqual({
			new: "New Transaction",
			edit: "Edit Transaction",
			duplicate: "Duplicate Transaction",
		});
	});
});

describe("rowValues (BR-F03-11, D-238)", () => {
	test("#24: its values in the user's format, the stored date and the time in the zone", () => {
		expect(rowValues(ROW_24, IN)).toEqual({
			type: "expense",
			amount: "640.00",
			payee: "Swiggy",
			category: "food",
			date: "2026-10-19",
			time: "22:15",
			description: "",
			note: "",
		});
	});

	test("the amount takes the profile's grouping and the text keeps line breaks", () => {
		expect(
			rowValues(
				row({ amountMinor: 17000000, description: "Rent", note: "a\nb" }),
				IN,
			),
		).toMatchObject({
			amount: "1,70,000.00",
			description: "Rent",
			note: "a\nb",
		});
	});

	// AC-F03-32
	test("#26 in America/Los_Angeles shows the stored 1 Nov with 12:00 pm", () => {
		expect(rowValues(ROW_26, LA)).toMatchObject({
			date: "2026-11-01",
			time: "12:00",
		});
	});

	test("a row with no payee or category starts them empty", () => {
		expect(rowValues(row({ payee: null, category: null }), IN)).toMatchObject({
			payee: "",
			category: null,
		});
	});

	test("Goal rows wait for M2's Goal fields", () => {
		expect(() =>
			rowValues(row({ type: "goal_contribution", category: null }), IN),
		).toThrow(RangeError);
		expect(() =>
			rowValues(row({ type: "goal_withdrawal", category: null }), IN),
		).toThrow(RangeError);
	});
});

describe("duplicateValues (BR-F03-28)", () => {
	test("copies the row's values and dates it now", () => {
		expect(
			duplicateValues(row({ description: "Dinner", note: "Team" }), IN, NOW),
		).toEqual({
			type: "expense",
			amount: "640.00",
			payee: "Swiggy",
			category: "food",
			date: "2026-11-02",
			time: "12:00",
			description: "Dinner",
			note: "Team",
		});
	});

	test("a charge copies the same way; the create makes it a manual row", () => {
		expect(
			duplicateValues(row({ source: "subscription", demo: true }), IN, NOW),
		).toMatchObject({ date: "2026-11-02", time: "12:00", payee: "Swiggy" });
	});
});

describe("modeValues", () => {
	test("new, edit and duplicate start where each should", () => {
		expect(modeValues({ kind: "new" }, IN, NOW)).toEqual(
			startValues(IN.timezone, NOW),
		);
		expect(modeValues({ kind: "edit", row: ROW_24 }, IN, NOW)).toEqual(
			rowValues(ROW_24, IN),
		);
		expect(modeValues({ kind: "duplicate", row: ROW_24 }, IN, NOW)).toEqual(
			duplicateValues(ROW_24, IN, NOW),
		);
	});
});

describe("hasFixedDate (BR-F03-11)", () => {
	test("a charge and a demo row have a fixed date and time; a manual row does not", () => {
		expect(hasFixedDate({ source: "subscription", demo: false })).toBe(true);
		expect(hasFixedDate({ source: "manual", demo: true })).toBe(true);
		expect(hasFixedDate({ source: "manual", demo: false })).toBe(false);
	});
});

describe("rowWindow (TIME-7, BR-F03-11)", () => {
	test("#24: its recording date and the 10 days before", () => {
		expect(rowWindow(ROW_24.createdAt, IN.timezone)).toEqual({
			firstOn: "2026-10-09",
			lastOn: "2026-10-19",
		});
	});

	test("the recording date is read in the current zone", () => {
		expect(rowWindow(ROW_26.createdAt, "Asia/Kolkata")).toEqual({
			firstOn: "2026-10-22",
			lastOn: "2026-11-01",
		});
		expect(rowWindow(ROW_26.createdAt, "America/Los_Angeles")).toEqual({
			firstOn: "2026-10-21",
			lastOn: "2026-10-31",
		});
	});
});

describe("editCalendarNote (BR-F03-75)", () => {
	test("names the row's own window", () => {
		expect(
			editCalendarNote(
				{ firstOn: "2026-10-06", lastOn: "2026-10-16" },
				{ today: "2026-11-02", dateLocale: "en-IN" },
			),
		).toBe(
			"You can choose a date from 6 Oct to 16 Oct. Arrow keys move, Enter picks.",
		);
	});

	test("a year shows outside the current one", () => {
		expect(
			editCalendarNote(
				{ firstOn: "2025-12-25", lastOn: "2026-01-04" },
				{ today: "2026-01-10", dateLocale: "en-IN" },
			),
		).toBe(
			"You can choose a date from 25 Dec 2025 to 4 Jan. Arrow keys move, Enter picks.",
		);
	});
});

describe("checkEntry on an edit (BR-F03-09, BR-F03-11, D-499)", () => {
	const start = rowValues(ROW_24, IN);
	const rules = { start, window: rowWindow(ROW_24.createdAt, IN.timezone) };
	const editFields = (changes: Partial<EntryValues>, locale = IN, now = NOW) => {
		const checked = checkEntry({ ...start, ...changes }, locale, now, rules);
		return checked.ok ? {} : checked.fields;
	};

	test("the row as it opened passes, though its date is outside today's window", () => {
		expect(editFields({})).toEqual({});
	});

	test("a date moved inside the row's window passes, at either end", () => {
		expect(editFields({ date: "2026-10-09" })).toEqual({});
		expect(editFields({ date: "2026-10-19" })).toEqual({});
	});

	test("a date moved outside the row's window names that window", () => {
		expect(editFields({ date: "2026-10-08" })).toEqual({
			date: "Choose a date from 9 Oct to 19 Oct.",
		});
		expect(editFields({ date: "2026-10-20" })).toEqual({
			date: "Choose a date from 9 Oct to 19 Oct.",
		});
	});

	test("the stored date outside the window, after a zone change, passes while kept", () => {
		const shifted = rowValues(ROW_26, LA);
		const laRules = {
			start: shifted,
			window: rowWindow(ROW_26.createdAt, LA.timezone),
		};
		expect(checkEntry(shifted, LA, NOW, laRules).ok).toBe(true);
		expect(
			checkEntry({ ...shifted, date: "2026-10-30" }, LA, NOW, laRules).ok,
		).toBe(true);
	});

	test("an unchanged date and time are never checked against now", () => {
		const today = row({
			occurredOn: "2026-11-02",
			occurredAt: "2026-11-02T06:33:00.000Z",
			createdAt: "2026-11-02T06:33:00.000Z",
		});
		const kept = rowValues(today, IN);
		expect(
			checkEntry(kept, IN, NOW, {
				start: kept,
				window: rowWindow(today.createdAt, IN.timezone),
			}).ok,
		).toBe(true);
	});

	test("a changed time later than now on today gets the future message", () => {
		const today = row({
			occurredOn: "2026-11-02",
			occurredAt: "2026-11-02T05:30:00.000Z",
			createdAt: "2026-11-02T05:31:00.000Z",
		});
		const kept = rowValues(today, IN);
		const todayRules = {
			start: kept,
			window: rowWindow(today.createdAt, IN.timezone),
		};
		expect(checkEntry({ ...kept, time: "12:00" }, IN, NOW, todayRules).ok).toBe(
			true,
		);
		const later = checkEntry({ ...kept, time: "12:01" }, IN, NOW, todayRules);
		expect(later.ok ? {} : later.fields).toEqual({
			time: TRANSACTION_MESSAGES.timeInFuture,
		});
	});

	test("a date moved to today with a time already past now gets the future message", () => {
		const yesterday = row({
			occurredOn: "2026-11-01",
			occurredAt: "2026-11-01T08:00:00.000Z",
			createdAt: "2026-11-02T05:00:00.000Z",
		});
		const kept = rowValues(yesterday, IN);
		const checked = checkEntry({ ...kept, date: "2026-11-02" }, IN, NOW, {
			start: kept,
			window: rowWindow(yesterday.createdAt, IN.timezone),
		});
		expect(checked.ok ? {} : checked.fields).toEqual({
			time: TRANSACTION_MESSAGES.timeInFuture,
		});
	});

	test("the other fields are checked as on a create", () => {
		expect(
			editFields({ amount: "", payee: " ", category: "salary", time: null }),
		).toEqual({
			amount: "Enter an amount.",
			payee: TRANSACTION_MESSAGES.payeeRequired,
			category: TRANSACTION_MESSAGES.categoryRequired,
			time: ENTRY_TEXT.timeRequired,
		});
	});
});

describe("editBody (BR-F03-23)", () => {
	const start = rowValues(ROW_24, IN);
	const bodyOf = (
		changes: Partial<EntryValues>,
		base = ROW_24,
		from = start,
		locale = IN,
	) => {
		const values = { ...from, ...changes };
		const checked = checkEntry(values, locale, NOW, {
			start: from,
			window: rowWindow(base.createdAt, locale.timezone),
		});
		if (!checked.ok) throw new Error(JSON.stringify(checked.fields));
		return editBody(values, checked, { row: base, start: from }, locale);
	};

	test("nothing changed sends nothing", () => {
		expect(bodyOf({})).toBeNull();
	});

	test("the amount typed differently but the same value is no change", () => {
		expect(bodyOf({ amount: "640" })).toBeNull();
	});

	test("an amount brings its currency", () => {
		expect(bodyOf({ amount: "700" })).toEqual({
			amountMinor: 70000,
			currency: "INR",
		});
	});

	test("each text field alone, trimmed, with empty text as null", () => {
		expect(bodyOf({ payee: " Zomato " })).toEqual({ payee: "Zomato" });
		expect(bodyOf({ description: "Dinner" })).toEqual({ description: "Dinner" });
		expect(bodyOf({ note: "Team\nlunch" })).toEqual({ note: "Team\nlunch" });
		const described = row({ description: "Dinner", note: "Old" });
		const from = rowValues(described, IN);
		expect(bodyOf({ description: "  ", note: "" }, described, from)).toEqual({
			description: null,
			note: null,
		});
	});

	test("a type within the group keeps a shared category, and sends it only if moved", () => {
		expect(bodyOf({ type: "refund" })).toEqual({ type: "refund" });
		expect(bodyOf({ type: "income", category: "salary" })).toEqual({
			type: "income",
			category: "salary",
		});
		expect(bodyOf({ category: "shopping" })).toEqual({ category: "shopping" });
	});

	test("a date sends the date and the time together", () => {
		expect(bodyOf({ date: "2026-10-18" })).toEqual({
			occurredAt: "2026-10-18T16:45:00Z",
			occurredOn: "2026-10-18",
		});
	});

	// AC-F03-32: 1 Nov 2026 is the day Los Angeles leaves daylight saving, so 11:00 am is UTC−8.
	test("#26 in America/Los_Angeles: a new time alone keeps the stored 1 Nov", () => {
		const shifted = rowValues(ROW_26, LA);
		expect(bodyOf({ time: "11:00" }, ROW_26, shifted, LA)).toEqual({
			occurredAt: "2026-11-01T19:00:00Z",
			occurredOn: "2026-11-01",
		});
	});

	test("several changes go together", () => {
		expect(bodyOf({ amount: "700", payee: "Zomato", time: "21:00" })).toEqual({
			amountMinor: 70000,
			currency: "INR",
			payee: "Zomato",
			occurredAt: "2026-10-19T15:30:00Z",
			occurredOn: "2026-10-19",
		});
	});
});

describe("changedFields (BR-F03-78)", () => {
	const start = { date: "2026-10-19", time: "22:15" };

	test("each sent field in the dialog's order", () => {
		expect(
			changedFields(
				{
					note: null,
					description: "x",
					category: "shopping",
					payee: "Zomato",
					amountMinor: 1,
					currency: "INR",
					type: "refund",
				},
				start,
				start,
			),
		).toEqual(["type", "amount", "payee", "category", "description", "note"]);
	});

	test("the date and the time each count only when they moved", () => {
		const body = {
			occurredAt: "2026-10-19T16:00:00Z",
			occurredOn: "2026-10-19",
		};
		expect(changedFields(body, { ...start, time: "21:30" }, start)).toEqual([
			"time",
		]);
		expect(changedFields(body, { ...start, date: "2026-10-18" }, start)).toEqual(
			["date"],
		);
		expect(
			changedFields(body, { date: "2026-10-18", time: "21:30" }, start),
		).toEqual(["date", "time"]);
	});

	test("nothing sent names nothing", () => {
		expect(changedFields({}, start, start)).toEqual([]);
	});
});

describe("chargeNotice (BR-F03-48, BR-F03-16)", () => {
	test("an unlinked charge, as every charge is at M1 (D-475)", () => {
		expect(chargeNotice({ subscriptionId: null, payee: "Netflix" })).toBe(
			"From a deleted Subscription. Its type, date and time are fixed.",
		);
	});

	test("a linked charge names its payee", () => {
		expect(
			chargeNotice({
				subscriptionId: "0192f0c4-7a1e-7c3b-9d2a-000000000001",
				payee: "Netflix",
			}),
		).toBe(
			"Auto from Netflix. Its type, date and time are fixed; editing it stops the Subscription from changing this charge.",
		);
	});
});
