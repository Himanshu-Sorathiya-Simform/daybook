import { describe, expect, test } from "vitest";

import {
	addNextDates,
	addView,
	cadenceOf,
	createBody,
	DIALOG_TEXT,
	type DialogValues,
	duplicateNote,
	editSchedule,
	everyText,
	fieldMessages,
	filledHint,
	nextChargesLine,
	pastChoices,
	scheduleSummary,
	spanBefore,
	startDateOk,
	startValues,
	wasHints,
	yesterday,
} from "../dialog";
import { subscriptionItem, IN_LOCALE as IN } from "./fixtures";

const NETFLIX = subscriptionItem("netflix");
const ID = "0192f0c4-7a1e-7c3b-9d2a-000000000001";

const filled = (over: Partial<DialogValues> = {}): DialogValues => ({
	...startValues(null, IN),
	name: "Netflix",
	amount: "649.00",
	category: "entertainment",
	...over,
});

describe("the values a dialog opens with (BR-F05-24)", () => {
	test("Add is empty, monthly, started today, with nothing chosen", () => {
		expect(startValues(null, IN)).toEqual({
			name: "",
			amount: "",
			preset: "monthly",
			every: "2",
			unit: "month",
			category: null,
			startDate: "2026-11-02",
			note: "",
			past: "no",
			skipDouble: true,
			alsoPast: false,
		});
	});

	test("Edit holds the Subscription's own values, the amount in the user's format", () => {
		expect(startValues(NETFLIX, IN)).toMatchObject({
			name: "Netflix",
			amount: "649.00",
			preset: "monthly",
			category: "entertainment",
			startDate: "2026-09-05",
			note: "",
		});
	});

	test("Edit of a custom cadence opens on Custom with its number and unit", () => {
		const item = subscriptionItem("netflix", {
			cadence: { unit: "week", every: 3 },
		});
		expect(startValues(item, IN)).toMatchObject({
			preset: "custom",
			every: "3",
			unit: "week",
		});
	});

	test("Edit of a preset keeps the custom fields at 2 months", () => {
		expect(startValues(subscriptionItem("amazonPrime"), IN)).toMatchObject({
			preset: "yearly",
			every: "2",
			unit: "month",
		});
	});

	test("Edit opens with the note when the Subscription has one", () => {
		const item = subscriptionItem("netflix", { note: "Family plan" });
		expect(startValues(item, IN).note).toBe("Family plan");
	});
});

describe("the cadence a choice makes (BR-F05-24)", () => {
	test.each([
		["weekly", { unit: "week", every: 1 }],
		["monthly", { unit: "month", every: 1 }],
		["quarterly", { unit: "month", every: 3 }],
		["yearly", { unit: "month", every: 12 }],
	] as const)("%s is its preset", (preset, cadence) => {
		expect(cadenceOf({ preset, every: "2", unit: "month" })).toEqual(cadence);
	});

	test("a preset ignores the custom fields", () => {
		expect(cadenceOf({ preset: "weekly", every: "", unit: "month" })).toEqual({
			unit: "week",
			every: 1,
		});
	});

	test("a custom choice is its number and unit", () => {
		expect(cadenceOf({ preset: "custom", every: "7", unit: "month" })).toEqual({
			unit: "month",
			every: 7,
		});
	});

	test.each([
		["", "month"],
		["0", "month"],
		["25", "month"],
		["53", "week"],
		["1a", "week"],
		["-1", "week"],
	] as const)("custom %j %s is no cadence", (every, unit) => {
		expect(cadenceOf({ preset: "custom", every, unit })).toBeNull();
	});

	test.each([
		["24", "month"],
		["52", "week"],
		["1", "week"],
	] as const)("custom %s %s is the edge it is", (every, unit) => {
		expect(cadenceOf({ preset: "custom", every, unit })).toEqual({
			unit,
			every: Number(every),
		});
	});

	// AC-F05-43
	test("a custom value equal to a preset is the preset's cadence", () => {
		expect(cadenceOf({ preset: "custom", every: "3", unit: "month" })).toEqual(
			cadenceOf({ preset: "quarterly", every: "9", unit: "week" }),
		);
	});

	test("the custom number drops other characters and keeps two digits", () => {
		expect(everyText("1a2b3")).toBe("12");
		expect(everyText("abc")).toBe("");
		expect(everyText("7")).toBe("7");
	});
});

describe("the messages under the fields (BR-F05-24, section 8)", () => {
	test("a filled Add has none", () => {
		expect(fieldMessages(filled(), IN, null)).toEqual({});
	});

	// AC-F05-43
	test("an empty Add asks for a name, an amount and a category", () => {
		expect(fieldMessages(startValues(null, IN), IN, null)).toEqual({
			name: "Enter a name, like Netflix or Rent.",
			amount: "Enter an amount.",
			category: "Choose a category.",
		});
	});

	test("a name of 61 characters is too long, 60 is not", () => {
		expect(fieldMessages(filled({ name: "n".repeat(61) }), IN, null).name).toBe(
			"Use 60 characters or fewer.",
		);
		expect(
			fieldMessages(filled({ name: "n".repeat(60) }), IN, null).name,
		).toBeUndefined();
	});

	test("a name of spaces is a missing name", () => {
		expect(fieldMessages(filled({ name: "   " }), IN, null).name).toBe(
			"Enter a name, like Netflix or Rent.",
		);
	});

	test.each([
		["abc", "Enter a number, like 1,240.50."],
		["0", "Enter an amount above zero."],
		["1.234", "Use at most 2 decimal places."],
	])("the amount %j says %j, as F03 words it", (amount, message) => {
		expect(fieldMessages(filled({ amount }), IN, null).amount).toBe(message);
	});

	test("the amount past the largest says so", () => {
		expect(
			fieldMessages(filled({ amount: "999999999999999" }), IN, null).amount,
		).toMatch(/^The largest amount is /);
	});

	test.each([
		["0", "month", "Enter how many months, from 1 to 24."],
		["25", "month", "Enter how many months, from 1 to 24."],
		["53", "week", "Enter how many weeks, from 1 to 52."],
		["", "week", "Enter how many weeks, from 1 to 52."],
	] as const)("custom %j %s says %j", (every, unit, message) => {
		expect(
			fieldMessages(filled({ preset: "custom", every, unit }), IN, null)
				.cadence,
		).toBe(message);
	});

	test("a preset never has a cadence message, whatever the custom fields hold", () => {
		expect(
			fieldMessages(filled({ preset: "monthly", every: "99" }), IN, null)
				.cadence,
		).toBeUndefined();
	});

	test("a note of 501 characters is too long, 500 is not", () => {
		expect(fieldMessages(filled({ note: "n".repeat(501) }), IN, null).note).toBe(
			"Use 500 characters or fewer.",
		);
		expect(
			fieldMessages(filled({ note: "n".repeat(500) }), IN, null).note,
		).toBeUndefined();
	});

	test.each([
		["2016-11-02", true],
		["2016-11-01", false],
		["2027-11-02", true],
		["2027-11-03", false],
	])("a start of %s on an Add passes: %s", (startDate, passes) => {
		const message = fieldMessages(filled({ startDate }), IN, null).startDate;
		expect(message === undefined).toBe(passes);
		if (!passes)
			expect(message).toBe("Choose a date from 2 Nov 2016 to 2 Nov 2027.");
	});

	test("an Edit does not judge a start date it did not change", () => {
		const old = subscriptionItem("netflix", { startDate: "2010-01-01" });
		expect(
			fieldMessages(startValues(old, IN), IN, old).startDate,
		).toBeUndefined();
	});

	test("an Edit judges a start date it moved", () => {
		const message = fieldMessages(
			{ ...startValues(NETFLIX, IN), startDate: "2010-01-01" },
			IN,
			NETFLIX,
		).startDate;
		expect(message).toBe("Choose a date from 2 Nov 2016 to 2 Nov 2027.");
	});

	test("an Edit with its own values has none", () => {
		expect(fieldMessages(startValues(NETFLIX, IN), IN, NETFLIX)).toEqual({});
	});

	test("an Edit cleared of its name asks for one", () => {
		expect(
			fieldMessages({ ...startValues(NETFLIX, IN), name: "" }, IN, NETFLIX)
				.name,
		).toBe("Enter a name, like Netflix or Rent.");
	});

	test("startDateOk follows the same window", () => {
		expect(startDateOk("2026-11-02", IN, null)).toBe(true);
		expect(startDateOk("2016-11-01", IN, null)).toBe(false);
		expect(startDateOk("2010-01-01", IN, { startDate: "2010-01-01" })).toBe(
			true,
		);
	});
});

describe("the hints of an Edit's changed fields (BR-F05-24)", () => {
	const hints = (over: Partial<DialogValues>) =>
		wasHints(NETFLIX, { ...startValues(NETFLIX, IN), ...over }, IN);

	test("unchanged fields have none", () => {
		expect(hints({})).toEqual({});
	});

	test("the amount: Was 649.00", () => {
		expect(hints({ amount: "799" })).toEqual({ amount: "Was ₹649.00" });
	});

	test("the name: Was Netflix", () => {
		expect(hints({ name: "Netflix Premium" })).toEqual({ name: "Was Netflix" });
	});

	test("a name that only differs by spaces is no change", () => {
		expect(hints({ name: "  Netflix  " })).toEqual({});
	});

	test("the cadence: Was Monthly", () => {
		expect(hints({ preset: "weekly" })).toEqual({ cadence: "Was Monthly" });
	});

	test("a custom cadence equal to the stored one is no change", () => {
		expect(hints({ preset: "custom", every: "1", unit: "month" })).toEqual({});
	});

	test("a custom stored cadence reads Was Every 2 weeks", () => {
		const item = subscriptionItem("netflix", {
			cadence: { unit: "week", every: 2 },
		});
		expect(
			wasHints(item, { ...startValues(item, IN), preset: "monthly" }, IN),
		).toEqual({ cadence: "Was Every 2 weeks" });
	});

	test("the category: Was Entertainment", () => {
		expect(hints({ category: "shopping" })).toEqual({
			category: "Was Entertainment",
		});
	});

	test("the start: Was 5 Sept 2026", () => {
		expect(hints({ startDate: "2026-09-20" })).toEqual({
			startDate: "Was 5 Sept 2026",
		});
	});

	test("an amount that is not a number has no hint", () => {
		expect(hints({ amount: "abc" })).toEqual({});
	});

	test("every changed field has its own", () => {
		expect(
			Object.keys(
				hints({
					name: "N",
					amount: "1",
					preset: "yearly",
					category: "food",
					startDate: "2026-10-01",
				}),
			).sort(),
		).toEqual(["amount", "cadence", "category", "name", "startDate"]);
	});
});

describe("the hint after choosing a payee (BR-F05-24, D-594)", () => {
	test("names the payee, its last expense's category and amount", () => {
		expect(
			filledHint(
				"Netflix",
				{ category: "entertainment", amountMinor: 64900 },
				IN,
			),
		).toBe("Filled from your last Netflix expense: Entertainment, ₹649.00.");
	});
});

describe("the body of an Add (section 11)", () => {
	const make = (over: Partial<DialogValues> = {}, backfill = false) =>
		createBody(filled(over), IN, {
			id: ID,
			createdAt: "2026-11-02T06:30:00.000Z",
			backfill,
		});

	test("carries every field once, the amount in minor units with the currency", () => {
		expect(make({ startDate: "2025-09-05" }, true)).toEqual({
			id: ID,
			name: "Netflix",
			amountMinor: 64900,
			currency: "INR",
			cadence: { unit: "month", every: 1 },
			startDate: "2025-09-05",
			category: "entertainment",
			note: "",
			backfill: true,
			createdAt: "2026-11-02T06:30:00.000Z",
		});
	});

	test("reads the amount in the user's own format", () => {
		expect(make({ amount: "1,23,456.50" })?.amountMinor).toBe(12345650);
	});

	test("a custom cadence is sent as its number and unit", () => {
		expect(
			make({ preset: "custom", every: "7", unit: "month" })?.cadence,
		).toEqual({ unit: "month", every: 7 });
	});

	test.each([
		["no amount", { amount: "" }],
		["a bad amount", { amount: "abc" }],
		["a bad cadence", { preset: "custom", every: "0" } as const],
		["no category", { category: null }],
	])("with %s there is no body", (_name, over) => {
		expect(make(over)).toBeNull();
	});

	test("its own schema accepts what it builds", () => {
		const body = make();
		expect(body).not.toBeNull();
	});
});

describe("the schedule line (BR-F05-24)", () => {
	const text = (over: Partial<Parameters<typeof scheduleSummary>[0]> = {}) =>
		scheduleSummary(
			{
				repeats: "Every month on the 5th",
				cadence: { unit: "month", every: 1 },
				amountMinor: 64900,
				dates: ["2026-11-05", "2026-12-05", "2027-01-05"],
				starts: false,
				...over,
			},
			IN,
		);

	test("a monthly one says what it costs a year, and no monthly figure", () => {
		expect(text().repeats).toBe("Every month on the 5th · ₹7,788.00 a year");
	});

	test("another cadence adds its monthly equivalent", () => {
		expect(
			text({
				repeats: "Every year on 12 Oct",
				cadence: { unit: "month", every: 12 },
				amountMinor: 149900,
			}).repeats,
		).toBe("Every year on 12 Oct · ₹1,499.00 a year · ≈ ₹124.92 a month");
	});

	test("the costs wait for a valid amount", () => {
		expect(text({ amountMinor: null }).repeats).toBe("Every month on the 5th");
	});

	test("the next charges follow, with weekdays", () => {
		expect(text().next).toBe(
			"Next charges: Thu, 5 Nov, Sat, 5 Dec, Tue, 5 Jan, 2027.",
		);
	});

	test("a start that has not come reads Starts", () => {
		expect(text({ starts: true }).next).toMatch(/^Starts Thu, 5 Nov/);
	});

	test("with no date there is no second line", () => {
		expect(text({ dates: [] }).next).toBeNull();
		expect(nextChargesLine([], { starts: false }, IN)).toBeNull();
	});
});

describe("an Add's next dates (BR-F05-24)", () => {
	const monthly = { cadence: { unit: "month", every: 1 } } as const;

	test("are the first three on or after today, whichever past choice is picked", () => {
		expect(
			addNextDates({ ...monthly, startDate: "2025-09-05" }, "2026-11-02"),
		).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
	});

	test("a start today is its own first date", () => {
		expect(
			addNextDates({ ...monthly, startDate: "2026-11-02" }, "2026-11-02")[0],
		).toBe("2026-11-02");
	});

	test("a start in the future begins there", () => {
		expect(
			addNextDates({ ...monthly, startDate: "2026-12-05" }, "2026-11-02"),
		).toEqual(["2026-12-05", "2027-01-05", "2027-02-05"]);
	});
});

describe("how long before today a start was (BR-F05-04)", () => {
	test.each([
		["2026-11-01", "1 day"],
		["2026-10-30", "3 days"],
		["2026-09-04", "59 days"],
		["2026-09-03", "2 months"],
		["2025-09-05", "14 months"],
	])("from %s is %s", (start, words) => {
		expect(spanBefore(start, "2026-11-02")).toBe(words);
	});
});

describe("the past-charges choice (BR-F05-04)", () => {
	const choices = (over: Partial<Parameters<typeof pastChoices>[0]> = {}) =>
		pastChoices(
			{
				name: "Netflix",
				startDate: "2025-09-05",
				cadence: { unit: "month", every: 1 },
				amountMinor: 64900,
				nextFirst: "2026-11-05",
				...over,
			},
			IN,
		);

	// AC-F05-43
	test("is the heading, then No chosen first and Yes with the count and total", () => {
		const found = choices();
		expect(found?.heading).toBe(
			"Netflix started 14 months before today. Add the charges from before?",
		);
		expect(found?.no.title).toBe("No, start with the next one");
		expect(found?.no.description).toBe(
			"First charge: Thu, 5 Nov. Pick this if the past payments are already in Transactions, or you don't need them.",
		);
		expect(found?.yes.title).toBe("Yes, add 14 past charges, ₹9,086.00");
		expect(found?.yes.description).toBe(
			"One expense on each due date, from 5 Sept 2025 to 5 Oct 2026. They count in those months' spending, Budgets and reports.",
		);
		expect(found?.count).toBe(14);
	});

	test("one past date reads 1 past charge, on that date", () => {
		const found = choices({ startDate: "2026-10-05" });
		expect(found?.yes.title).toBe("Yes, add 1 past charge, ₹649.00");
		expect(found?.yes.description).toBe(
			"One expense on 5 Oct 2026. They count in those months' spending, Budgets and reports.",
		);
	});

	test("the total is left out while the amount is not valid", () => {
		expect(choices({ amountMinor: null })?.yes.title).toBe(
			"Yes, add 14 past charges",
		);
	});

	test("an empty name reads This Subscription", () => {
		expect(choices({ name: "" })?.heading).toBe(
			"This Subscription started 14 months before today. Add the charges from before?",
		);
	});

	test("there is none when no due date lies before today", () => {
		expect(choices({ startDate: "2026-11-02" })).toBeNull();
		expect(choices({ startDate: "2026-12-05" })).toBeNull();
	});

	test("the first charge line is left out with no next date", () => {
		expect(choices({ nextFirst: null })?.no.description).toBe(
			"Pick this if the past payments are already in Transactions, or you don't need them.",
		);
	});

	test("a weekly Subscription counts its weeks", () => {
		expect(
			choices({
				startDate: "2026-10-05",
				cadence: { unit: "week", every: 1 },
			})?.count,
		).toBe(4);
	});
});

describe("the duplicate note (BR-F05-04)", () => {
	// AC-F05-43
	test("two expenses name both dates", () => {
		expect(duplicateNote("Netflix", ["2026-10-05", "2026-09-05"], IN)).toBe(
			"You already have 2 Netflix expenses in that period, on 5 Sept, 5 Oct. Adding past charges would count them twice.",
		);
	});

	test("one expense is singular", () => {
		expect(duplicateNote("Netflix", ["2026-09-05"], IN)).toBe(
			"You already have 1 Netflix expense in that period, on 5 Sept. Adding past charges would count it twice.",
		);
	});

	test("names the oldest three, then and more", () => {
		const note = duplicateNote(
			"Netflix",
			["2026-10-05", "2026-09-05", "2026-08-05", "2026-07-05"],
			IN,
		);
		expect(note).toContain("on 5 Jul, 5 Aug, 5 Sept and more.");
		expect(note).toContain("You already have 4 Netflix expenses");
	});

	test("exactly three has no and more", () => {
		expect(
			duplicateNote("Netflix", ["2026-10-05", "2026-09-05", "2026-08-05"], IN),
		).not.toContain("and more");
	});

	test("none, or no name, is no note", () => {
		expect(duplicateNote("Netflix", [], IN)).toBeNull();
		expect(duplicateNote("", ["2026-09-05"], IN)).toBeNull();
	});
});

describe("what an Add shows below its fields (BR-F05-24)", () => {
	// AC-F05-43
	test("is the schedule line and the past choice for a filled Add", () => {
		const view = addView(filled({ startDate: "2025-09-05" }), IN);
		expect(view.schedule?.repeats).toBe(
			"Every month on the 5th · ₹7,788.00 a year",
		);
		expect(view.schedule?.next).toBe(
			"Next charges: Thu, 5 Nov, Sat, 5 Dec, Tue, 5 Jan, 2027.",
		);
		expect(view.past?.count).toBe(14);
	});

	test("a future start reads Starts and has no past choice", () => {
		const view = addView(filled({ startDate: "2026-12-05" }), IN);
		expect(view.schedule?.next).toMatch(/^Starts Sat, 5 Dec/);
		expect(view.past).toBeNull();
	});

	test("with a custom number out of range there is nothing", () => {
		expect(addView(filled({ preset: "custom", every: "0" }), IN)).toEqual({
			schedule: null,
			past: null,
		});
	});

	test("with no amount the line stays and its costs are left out", () => {
		expect(
			addView(filled({ amount: "", startDate: "2026-09-05" }), IN).schedule
				?.repeats,
		).toBe("Every month on the 5th");
	});

	test("a start out of range shows nothing", () => {
		expect(addView(filled({ startDate: "2000-01-01" }), IN)).toEqual({
			schedule: null,
			past: null,
		});
	});

	test("a custom cadence is worded as it repeats", () => {
		expect(
			addView(
				filled({
					amount: "1000",
					preset: "custom",
					every: "7",
					unit: "month",
					startDate: "2026-09-05",
				}),
				IN,
			).schedule?.repeats,
		).toBe("Every 7 months on the 5th · ₹1,714.29 a year · ≈ ₹142.86 a month");
	});

	test("the past count follows the cadence", () => {
		expect(
			addView(filled({ preset: "weekly", startDate: "2026-10-05" }), IN).past
				?.count,
		).toBe(4);
	});
});

describe("an Edit's schedule line (BR-F05-24)", () => {
	test("is the schedule as the fields leave it, with the plan's dates", () => {
		const line = editSchedule(
			{ ...startValues(NETFLIX, IN), preset: "weekly" },
			["2026-11-05"],
			IN,
		);
		expect(line?.repeats).toBe(
			"Every Saturday · ₹33,748.00 a year · ≈ ₹2,812.33 a month",
		);
		expect(line?.next).toBe("Next charges: Thu, 5 Nov.");
	});

	test("is nothing while the custom number is out of range", () => {
		expect(
			editSchedule(
				{ ...startValues(NETFLIX, IN), preset: "custom", every: "0" },
				[],
				IN,
			),
		).toBeNull();
	});
});

describe("the dialog's words and dates", () => {
	test("the titles name what the dialog does", () => {
		expect(DIALOG_TEXT.addTitle).toBe("Add a Subscription");
		expect(DIALOG_TEXT.editTitle("Netflix")).toBe("Edit Netflix");
		expect(DIALOG_TEXT.add).toBe("Add Subscription");
		expect(DIALOG_TEXT.save).toBe("Save changes");
	});

	test("yesterday is the day before today", () => {
		expect(yesterday("2026-11-02")).toBe("2026-11-01");
		expect(yesterday("2026-01-01")).toBe("2025-12-31");
	});
});
