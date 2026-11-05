import { describe, expect, test } from "vitest";

import {
	CONFLICT_FIELDS,
	CONFLICT_TEXT,
	conflictRows,
	keepMineLine,
} from "../conflict";
import type { LabelLocale } from "../labels";
import { row } from "./fixtures";

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

// Flow 7.4 on golden #21: BigBasket 2,900.00 on 14 Oct, "Monthly groceries".
const BEFORE = row({
	amountMinor: 290000,
	occurredOn: "2026-10-14",
	occurredAt: "2026-10-14T13:30:00.000Z",
	payee: "BigBasket",
	description: "Monthly groceries",
	version: 1,
});
// Device A raised it to 3,100.00, so the saved row is at version 2.
const CURRENT = { ...BEFORE, amountMinor: 310000, version: 2 };

describe("CONFLICT_TEXT and CONFLICT_FIELDS (BR-F03-78)", () => {
	test("hold the view's words", () => {
		expect(CONFLICT_TEXT).toEqual({
			title: "This Transaction changed on another device",
			intro: "Your version and the saved one are side by side, with the differences marked.",
			field: "Field",
			mine: "Yours",
			theirs: "Saved now",
			differs: "Differs",
			keepMine: "Keep mine",
			keepTheirs: "Keep theirs",
		});
	});

	test("label the dialog's fields in its order", () => {
		expect(CONFLICT_FIELDS.map(({ field, label }) => [field, label])).toEqual([
			["type", "Type"],
			["amount", "Amount"],
			["payee", "Payee"],
			["category", "Category"],
			["date", "Date"],
			["time", "Time"],
			["description", "Description"],
			["note", "Note"],
		]);
	});
});

describe("conflictRows (BR-P1-26, BR-F03-78)", () => {
	// AC-F03-19 (flow 7.4)
	test("B's description over the row B opened, beside A's saved amount", () => {
		expect(
			conflictRows(BEFORE, { description: "October groceries" }, CURRENT, IN),
		).toEqual([
			{
				field: "type",
				label: "Type",
				mine: "Expense",
				theirs: "Expense",
				differs: false,
			},
			{
				field: "amount",
				label: "Amount",
				mine: "₹2,900.00",
				theirs: "₹3,100.00",
				differs: true,
			},
			{
				field: "payee",
				label: "Payee",
				mine: "BigBasket",
				theirs: "BigBasket",
				differs: false,
			},
			{
				field: "category",
				label: "Category",
				mine: "Food",
				theirs: "Food",
				differs: false,
			},
			{
				field: "date",
				label: "Date",
				mine: "Wed, 14 Oct",
				theirs: "Wed, 14 Oct",
				differs: false,
			},
			{
				field: "time",
				label: "Time",
				mine: "7:00 pm",
				theirs: "7:00 pm",
				differs: false,
			},
			{
				field: "description",
				label: "Description",
				mine: "October groceries",
				theirs: "Monthly groceries",
				differs: true,
			},
			{
				field: "note",
				label: "Note",
				mine: "None",
				theirs: "None",
				differs: false,
			},
		]);
	});

	test("a moved date and time show in the profile zone, with the old ones saved", () => {
		const rows = conflictRows(
			BEFORE,
			{ occurredAt: "2026-10-13T04:30:00Z", occurredOn: "2026-10-13" },
			CURRENT,
			IN,
		);
		expect(rows.find((each) => each.field === "date")).toMatchObject({
			mine: "Tue, 13 Oct",
			theirs: "Wed, 14 Oct",
			differs: true,
		});
		expect(rows.find((each) => each.field === "time")).toMatchObject({
			mine: "10:00 am",
			theirs: "7:00 pm",
			differs: true,
		});
	});

	test("emptied text reads None, and a charge's time reads Auto on both sides", () => {
		const charge = { ...BEFORE, source: "subscription" as const, note: "Old" };
		const rows = conflictRows(
			charge,
			{ description: null, note: null },
			{ ...charge, version: 2 },
			IN,
		);
		expect(rows.find((each) => each.field === "description")).toMatchObject({
			mine: "None",
			theirs: "Monthly groceries",
			differs: true,
		});
		expect(rows.find((each) => each.field === "note")).toMatchObject({
			mine: "None",
			theirs: "Old",
		});
		expect(rows.find((each) => each.field === "time")).toMatchObject({
			mine: "Auto",
			theirs: "Auto",
			differs: false,
		});
	});

	test("a type and category changed on both sides, and a payee the other side removed", () => {
		const rows = conflictRows(
			BEFORE,
			{ type: "income", category: "salary" },
			{ ...CURRENT, type: "refund", category: "shopping", payee: null },
			IN,
		);
		expect(rows.slice(0, 4).map(({ mine, theirs }) => [mine, theirs])).toEqual([
			["Income", "Refund"],
			["₹2,900.00", "₹3,100.00"],
			["BigBasket", "None"],
			["Salary", "Shopping"],
		]);
	});

	test("a category the other side cleared reads None", () => {
		const rows = conflictRows(BEFORE, {}, { ...CURRENT, category: null }, IN);
		expect(rows.find((each) => each.field === "category")).toMatchObject({
			mine: "Food",
			theirs: "None",
			differs: true,
		});
	});

	test("the amounts follow the profile's currency and grouping", () => {
		const rows = conflictRows(
			BEFORE,
			{ amountMinor: 17000000, currency: "INR" },
			CURRENT,
			IN,
		);
		expect(rows[1]).toMatchObject({ mine: "₹1,70,000.00", theirs: "₹3,100.00" });
	});
});

describe("keepMineLine (BR-F03-78)", () => {
	test("one field", () => {
		expect(keepMineLine(["description"])).toBe(
			"Keep mine saves your change to Description and keeps the rest as it is saved now.",
		);
	});

	test("two fields, in the dialog's order whatever order they come in", () => {
		expect(keepMineLine(["note", "amount"])).toBe(
			"Keep mine saves your changes to Amount and Note and keeps the rest as it is saved now.",
		);
	});

	test("three or more fields", () => {
		expect(keepMineLine(["time", "type", "date", "amount"])).toBe(
			"Keep mine saves your changes to Type, Amount, Date and Time and keeps the rest as it is saved now.",
		);
	});
});
