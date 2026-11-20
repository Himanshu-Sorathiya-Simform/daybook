import { describe, expect, test } from "vitest";

import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import { type DialogValues, fieldMessages, startValues } from "../dialog";
import { alsoPastTitle, editView, periodWords, valueSentence } from "../edit-plan";
import type { SubscriptionItem, SubscriptionsLocale } from "../types";
import { charge, subscriptionItem, subscriptionList } from "./fixtures";

/** The golden profile at the golden clock: 2 November 2026 in `en-IN`. */
const IN: SubscriptionsLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
};
const ITEMS = subscriptionList().items;
const NETFLIX = subscriptionItem("netflix");
const SUNRISE = subscriptionItem("sunrise");
const NOW = "2026-11-02T06:30:00.000Z";

/** A Subscription's charge on its due date. */
const paid = (item: SubscriptionItem, dueOn: string, edited = false) =>
	charge({
		subscriptionId: item.id,
		dueOn,
		occurredOn: dueOn,
		amountMinor: item.amountMinor,
		edited,
	});

const NETFLIX_CHARGES = [paid(NETFLIX, "2026-09-05"), paid(NETFLIX, "2026-10-05")];
const SUNRISE_CHARGES = [
	paid(SUNRISE, "2026-09-01"),
	paid(SUNRISE, "2026-10-01"),
	paid(SUNRISE, "2026-11-01"),
];

/** The view of an Edit of `item` with `over` typed over its own values. */
function view(
	item: SubscriptionItem,
	over: Partial<DialogValues>,
	charges = item === SUNRISE ? SUNRISE_CHARGES : NETFLIX_CHARGES,
) {
	const values = { ...startValues(item, IN), ...over };
	return editView({
		item,
		items: ITEMS,
		values,
		messages: fieldMessages(values, IN, item),
		charges,
		locale: IN,
		changedAt: NOW,
	});
}

describe("an Edit that changes nothing (BR-F05-46)", () => {
	// AC-F05-43
	test("has no body, no preview and no note, and still has its next dates", () => {
		const found = view(NETFLIX, {});
		expect(found?.body).toBeNull();
		expect(found?.preview).toBe(false);
		expect(found?.noteOnly).toBe(false);
		expect(found?.strip).toEqual([]);
		expect(found?.nextDates).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
	});

	test("a name that differs only by spaces is no change", () => {
		expect(view(NETFLIX, { name: "  Netflix " })?.body).toBeNull();
	});

	test("an amount typed in another form but equal is no change", () => {
		expect(view(NETFLIX, { amount: "649" })?.body).toBeNull();
	});

	test("a custom cadence equal to the stored one is no change", () => {
		expect(
			view(NETFLIX, { preset: "custom", every: "1", unit: "month" })?.body,
		).toBeNull();
	});
});

describe("a price change (BR-F05-10, golden Sunrise Apartments raised to 19,500.00)", () => {
	const found = () => view(SUNRISE, { amount: "19,500.00" });

	// AC-F05-43
	test("sends the amount with its currency and nothing else", () => {
		expect(found()?.body).toEqual({
			changedAt: NOW,
			amountMinor: 1950000,
			currency: "INR",
		});
	});

	test("says what it means for charges", () => {
		expect(found()?.values).toBe(
			"Charges up to today keep their amount. Later ones use the new amount.",
		);
		expect(found()?.preview).toBe(true);
		expect(found()?.scheduleChanged).toBe(false);
	});

	// AC-F05-43
	test("shows the cost line with the totals before and after", () => {
		expect(found()?.costLine).toBe(
			"Monthly cost ₹20,273.92 → ₹21,773.92 · Yearly ₹2,43,287.00 → ₹2,61,287.00",
		);
	});

	// AC-F05-43
	test("the strip is the last two charges, today, then the next two at the new amount", () => {
		expect(found()?.strip).toEqual([
			{ kind: "kept", label: "1 Oct", amount: "₹18,000.00" },
			{ kind: "kept", label: "1 Nov", amount: "₹18,000.00" },
			{ kind: "today", label: "Today" },
			{ kind: "new", label: "1 Dec", amount: "₹19,500.00" },
			{ kind: "new", label: "1 Jan 2027", amount: "₹19,500.00" },
			{ kind: "more", label: "" },
		]);
	});

	test("the schedule is the same, so its next dates are", () => {
		expect(found()?.nextDates).toEqual([
			"2026-12-01",
			"2027-01-01",
			"2027-02-01",
		]);
	});

	test("a Subscription with no charge yet has no kept cell", () => {
		expect(
			view(SUNRISE, { amount: "19,500" }, [])?.strip.map((cell) => cell.kind),
		).toEqual(["today", "new", "new", "more"]);
	});

	test("with one charge there is one kept cell", () => {
		expect(
			view(SUNRISE, { amount: "19,500" }, [SUNRISE_CHARGES[2]!])?.strip.map(
				(cell) => cell.kind,
			),
		).toEqual(["kept", "today", "new", "new", "more"]);
	});

	test("charges after today are not among those that stay", () => {
		const later = [...SUNRISE_CHARGES, paid(SUNRISE, "2026-12-01")];
		expect(
			view(SUNRISE, { amount: "19,500" }, later)?.strip.filter(
				(cell) => cell.kind === "kept",
			),
		).toHaveLength(2);
	});
});

describe("the cost line (BR-F05-24)", () => {
	test("a cadence change has one too", () => {
		expect(view(NETFLIX, { preset: "weekly" })?.costLine).toMatch(
			/^Monthly cost ₹20,273\.92 → ₹/,
		);
	});

	test("a name change alone has none", () => {
		expect(view(NETFLIX, { name: "Netflix HD" })?.costLine).toBeNull();
	});

	test("a Subscription with no next due date has none", () => {
		const done = subscriptionItem("netflix", { nextDueOn: null });
		expect(view(done, { amount: "799" })?.costLine).toBeNull();
	});

	test("lowering an amount lowers the totals", () => {
		expect(view(SUNRISE, { amount: "17,000" })?.costLine).toBe(
			"Monthly cost ₹20,273.92 → ₹19,273.92 · Yearly ₹2,43,287.00 → ₹2,31,287.00",
		);
	});
});

describe("the sentence for a value change (BR-F05-24)", () => {
	test.each([
		[
			{ amount: true, name: false, category: false },
			"Charges up to today keep their amount. Later ones use the new amount.",
		],
		[
			{ amount: true, name: true, category: false },
			"Charges up to today keep their amount, name and category. Later ones use the new ones.",
		],
		[
			{ amount: true, name: false, category: true },
			"Charges up to today keep their amount, name and category. Later ones use the new ones.",
		],
		[
			{ amount: false, name: true, category: true },
			"Charges up to today keep their name and category. Later ones use the new ones.",
		],
		[
			{ amount: false, name: true, category: false },
			"Charges up to today keep their name. Later ones use the new one.",
		],
		[
			{ amount: false, name: false, category: true },
			"Charges up to today keep their category. Later ones use the new one.",
		],
	])("%j", (changed, text) => {
		expect(valueSentence(changed)).toBe(text);
	});

	test("with no value change there is none", () => {
		expect(
			valueSentence({ amount: false, name: false, category: false }),
		).toBeNull();
	});
});

describe("a note-only change (BR-F05-09)", () => {
	test("sends the note alone and shows only its line", () => {
		const found = view(NETFLIX, { note: "Family plan" });
		expect(found?.body).toEqual({ changedAt: NOW, note: "Family plan" });
		expect(found?.noteOnly).toBe(true);
		expect(found?.preview).toBe(false);
		expect(found?.costLine).toBeNull();
	});

	test("clearing a note sends null", () => {
		const item = subscriptionItem("netflix", { note: "Family plan" });
		expect(view(item, { note: "" })?.body).toEqual({
			changedAt: NOW,
			note: null,
		});
	});

	test("a note with a name change is not note-only", () => {
		const found = view(NETFLIX, { note: "x", name: "Netflix HD" });
		expect(found?.noteOnly).toBe(false);
		expect(found?.preview).toBe(true);
		expect(found?.body).toMatchObject({ name: "Netflix HD", note: "x" });
	});
});

describe("a schedule change (BR-F05-11)", () => {
	test("says past charges stay and the old next date moves", () => {
		const found = view(NETFLIX, { preset: "weekly" });
		expect(found?.scheduleChanged).toBe(true);
		expect(found?.preview).toBe(true);
		expect(found?.strip).toContainEqual({
			kind: "off",
			label: "5 Nov",
			amount: "₹649.00",
			note: "moves",
		});
		expect(found?.body).toEqual({
			changedAt: NOW,
			cadence: { unit: "week", every: 1 },
		});
	});

	test("a date the new schedule still has does not move, one it lacks does", () => {
		const every2 = view(NETFLIX, {
			preset: "custom",
			every: "2",
			unit: "month",
		});
		expect(every2?.strip.some((cell) => cell.note === "moves")).toBe(false);
		const yearly = view(NETFLIX, { preset: "yearly" });
		expect(yearly?.strip.some((cell) => cell.note === "moves")).toBe(true);
	});

	test("a new start sends the start date alone", () => {
		expect(view(NETFLIX, { startDate: "2026-09-20" })?.body).toEqual({
			changedAt: NOW,
			startDate: "2026-09-20",
		});
	});

	test("the next dates are those of the new schedule, after today", () => {
		expect(view(NETFLIX, { startDate: "2026-09-20" })?.nextDates).toEqual([
			"2026-11-20",
			"2026-12-20",
			"2027-01-20",
		]);
	});

	test("a schedule change in the future-start case begins at the new start", () => {
		expect(view(NETFLIX, { startDate: "2026-12-10" })?.nextDates[0]).toBe(
			"2026-12-10",
		);
	});
});

describe("the double charge (BR-F05-31)", () => {
	// Netflix was last charged on 5 Oct; moved to start on the 4th, its next date, 4 Nov, falls
	// less than a month after it.
	const doubled = (over: Partial<DialogValues> = {}) =>
		view(NETFLIX, { startDate: "2026-09-04", ...over });

	// AC-F05-43
	test("offers to skip the new schedule's first date, with both sentences", () => {
		expect(doubled()?.doubleCharge).toEqual({
			skipOn: "2026-11-04",
			title: "Skip 4 Nov, so it isn't charged twice",
			description:
				"5 Oct was already charged, less than one month before it. The first charge on the new date is 4 Dec.",
		});
	});

	test("ticked, the write carries the date and the strip strikes it as skipped", () => {
		const found = doubled({ skipDouble: true });
		expect(found?.body).toMatchObject({ skipDueOn: "2026-11-04" });
		expect(found?.strip).toContainEqual({
			kind: "off",
			label: "4 Nov",
			amount: "₹649.00",
			note: "skipped",
			warn: false,
		});
	});

	test("ticked, the next dates leave the skipped date out", () => {
		expect(doubled({ skipDouble: true })?.nextDates).toEqual([
			"2026-12-04",
			"2027-01-04",
			"2027-02-04",
		]);
	});

	test("not ticked, no date is skipped and the strip warns of a second charge", () => {
		const found = doubled({ skipDouble: false });
		expect(found?.body).not.toHaveProperty("skipDueOn");
		expect(found?.strip).toContainEqual({
			kind: "new",
			label: "4 Nov",
			amount: "₹649.00",
			note: "second charge",
			warn: true,
		});
		expect(found?.nextDates[0]).toBe("2026-11-04");
	});

	test("the two cells after it are other dates", () => {
		const labels = doubled({ skipDouble: false })
			?.strip.filter((cell) => cell.kind === "new")
			.map((cell) => cell.label);
		expect(labels).toEqual(["4 Nov", "4 Dec", "4 Jan 2027"]);
	});

	test("with a weekly period the sentence says one week", () => {
		const item = subscriptionItem("netflix", {
			cadence: { unit: "week", every: 1 },
		});
		const found = view(item, { preset: "weekly", startDate: "2026-09-04" }, [
			paid(item, "2026-10-29"),
		]);
		expect(found?.doubleCharge).toBeNull();
	});

	test("a change with no charge yet has no double charge", () => {
		expect(
			view(NETFLIX, { startDate: "2026-09-04" }, [])?.doubleCharge,
		).toBeNull();
	});
});

describe("a date that has passed (BR-F05-31)", () => {
	// AC-F05-43
	test("says nothing is charged until the next one", () => {
		const found = view(NETFLIX, { startDate: "2026-09-20" });
		expect(found?.passed).toBe(
			"20 Oct has passed, so nothing is charged until Fri, 20 Nov.",
		);
		expect(found?.doubleCharge).toBeNull();
	});

	test("is not there for a value change", () => {
		expect(view(NETFLIX, { amount: "799" })?.passed).toBeNull();
	});
});

describe("also changing the past charges (BR-F05-30)", () => {
	// AC-F05-43
	test("offers the unedited charges through today for a name change", () => {
		expect(view(NETFLIX, { name: "Netflix Premium" })?.alsoPast).toBe(2);
	});

	test("a category change offers them too", () => {
		expect(view(NETFLIX, { category: "shopping" })?.alsoPast).toBe(2);
	});

	test("an edited charge is not counted", () => {
		const charges = [
			paid(NETFLIX, "2026-09-05", true),
			paid(NETFLIX, "2026-10-05"),
		];
		expect(view(NETFLIX, { name: "Netflix Premium" }, charges)?.alsoPast).toBe(
			1,
		);
	});

	test("a price change offers none", () => {
		expect(view(NETFLIX, { amount: "799" })?.alsoPast).toBe(0);
	});

	test("with no charge there is none to change", () => {
		expect(view(NETFLIX, { name: "Netflix Premium" }, [])?.alsoPast).toBe(0);
	});

	test("ticked, the write asks for it", () => {
		expect(
			view(NETFLIX, { name: "Netflix Premium", alsoPast: true })?.body,
		).toEqual({
			changedAt: NOW,
			name: "Netflix Premium",
			alsoPastCharges: true,
		});
	});

	test("not ticked, it does not", () => {
		expect(view(NETFLIX, { name: "Netflix Premium" })?.body).not.toHaveProperty(
			"alsoPastCharges",
		);
	});

	test("ticked but with nothing to change, it is not sent", () => {
		expect(
			view(NETFLIX, { name: "Netflix Premium", alsoPast: true }, [])?.body,
		).not.toHaveProperty("alsoPastCharges");
	});

	test("a tick left from a name change that was undone is not sent", () => {
		expect(
			view(NETFLIX, { alsoPast: true, amount: "799" })?.body,
		).not.toHaveProperty("alsoPastCharges");
	});

	test("the title counts them", () => {
		expect(alsoPastTitle(2)).toBe("Also change the 2 past charges");
		expect(alsoPastTitle(1)).toBe("Also change the 1 past charge");
	});
});

describe("what is sent (BR-F05-46)", () => {
	test("only the fields that differ, whatever else was typed", () => {
		expect(
			view(NETFLIX, {
				name: "Netflix HD",
				amount: "649",
				category: "entertainment",
			})?.body,
		).toEqual({ changedAt: NOW, name: "Netflix HD" });
	});

	test("every changed field at once", () => {
		expect(
			view(NETFLIX, {
				name: "Netflix HD",
				amount: "799",
				category: "shopping",
				preset: "yearly",
				startDate: "2026-10-01",
				note: "x",
				skipDouble: false,
			})?.body,
		).toEqual({
			changedAt: NOW,
			name: "Netflix HD",
			amountMinor: 79900,
			currency: "INR",
			cadence: { unit: "month", every: 12 },
			startDate: "2026-10-01",
			category: "shopping",
			note: "x",
		});
	});

	test("a name is sent trimmed", () => {
		expect(view(NETFLIX, { name: "  Netflix HD " })?.body).toMatchObject({
			name: "Netflix HD",
		});
	});
});

describe("an Edit with a field that has a message (BR-F05-24)", () => {
	test("shows no preview and sends nothing, but keeps the schedule's dates", () => {
		const found = view(NETFLIX, { amount: "abc", startDate: "2026-09-20" });
		expect(found?.body).toBeNull();
		expect(found?.preview).toBe(false);
		expect(found?.nextDates).toEqual(["2026-11-20", "2026-12-20", "2027-01-20"]);
	});

	test("an empty name stands in as the Subscription's own", () => {
		expect(view(NETFLIX, { name: "", amount: "799" })?.body).toBeNull();
	});

	test("a custom number out of range has no view at all", () => {
		expect(view(NETFLIX, { preset: "custom", every: "0" })).toBeNull();
	});
});

describe("one period of the new cadence (BR-F05-31)", () => {
	test.each([
		[{ unit: "week", every: 1 }, "one week"],
		[{ unit: "month", every: 1 }, "one month"],
		[{ unit: "month", every: 12 }, "one year"],
		[{ unit: "week", every: 5 }, "5 weeks"],
		[{ unit: "month", every: 3 }, "3 months"],
		[{ unit: "month", every: 24 }, "24 months"],
	] as const)("%j reads %s", (cadence, words) => {
		expect(periodWords(cadence)).toBe(words);
	});
});

test("the golden Subscriptions are the ones these tests read", () => {
	expect(GOLDEN_SUBSCRIPTIONS.netflix.startDate).toBe("2026-09-05");
	expect(GOLDEN_SUBSCRIPTIONS.sunrise.amountMinor).toBe(1800000);
});
