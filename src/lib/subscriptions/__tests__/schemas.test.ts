import { describe, expect, test } from "vitest";
import type { z } from "zod";

import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { maxMinor } from "@/lib/currency";
import { uuidV7 } from "@/lib/ids";

import { SUBSCRIPTION_MESSAGES as M } from "../messages";
import {
	changedAtIssues,
	createWindowIssues,
	editWindowIssues,
	endDateIssues,
	endDateMax,
	INSTANT_WINDOW,
	instantProblem,
	monthsWindow,
	monthsWindowIssues,
	skipDateParamSchema,
	startDateWindow,
	subscriptionCreateSchema,
	subscriptionDeleteSchema,
	subscriptionEditSchema,
	subscriptionMonthsQuerySchema,
	subscriptionSkipSchema,
	subscriptionUnskipSchema,
} from "../schemas";

/** The golden clock: 2026-11-02T12:00:00+05:30. */
const NOW = new Date("2026-11-02T06:30:00.000Z");
const NOW_TEXT = NOW.toISOString();
const DAY = 86_400_000;

/** The issues a schema reports for `input`: `path: message`, in order, or `[]` when it passes. */
function issues(schema: z.ZodType, input: unknown): string[] {
	const result = schema.safeParse(input);
	if (result.success) return [];
	return result.error.issues.map(
		(issue) => `${issue.path.join(".")}: ${issue.message}`,
	);
}

const ID = "0199a000-0000-7000-8002-000000000002";

/** Golden Netflix as a client creates it (F05 section 15's item, section 7.1). */
const create = (changes: Record<string, unknown> = {}) => ({
	id: ID,
	name: "Netflix",
	amountMinor: 64900,
	currency: "INR",
	cadence: { unit: "month", every: 1 },
	startDate: "2026-09-05",
	category: "entertainment",
	note: null,
	backfill: false,
	createdAt: NOW_TEXT,
	...changes,
});

const edit = (changes: Record<string, unknown> = {}) => ({
	changedAt: NOW_TEXT,
	amountMinor: 79900,
	currency: "INR",
	...changes,
});

describe("subscriptionCreateSchema (F05 section 11)", () => {
	test("takes golden Netflix and gives back the body it understood", () => {
		expect(subscriptionCreateSchema.parse(create())).toEqual({
			id: ID,
			name: "Netflix",
			amountMinor: 64900,
			currency: "INR",
			cadence: { unit: "month", every: 1 },
			startDate: "2026-09-05",
			category: "entertainment",
			note: null,
			backfill: false,
			createdAt: NOW_TEXT,
		});
	});

	test("backfill defaults to the default choice, no past charges", () => {
		const without: Record<string, unknown> = create();
		delete without["backfill"];
		expect(subscriptionCreateSchema.parse(without).backfill).toBe(false);
	});

	test("takes the past charges choice", () => {
		expect(
			subscriptionCreateSchema.parse(create({ backfill: true })).backfill,
		).toBe(true);
	});

	test("a note may be left out", () => {
		const without: Record<string, unknown> = create();
		delete without["note"];
		expect(subscriptionCreateSchema.parse(without).note).toBeNull();
	});

	test("lower-cases the id", () => {
		expect(
			subscriptionCreateSchema.parse(create({ id: ID.toUpperCase() })).id,
		).toBe(ID);
	});

	test("sends back nothing it was not given, nothing from Daybook", () => {
		expect(Object.keys(subscriptionCreateSchema.parse(create())).sort()).toEqual(
			[
				"amountMinor",
				"backfill",
				"cadence",
				"category",
				"createdAt",
				"currency",
				"id",
				"name",
				"note",
				"startDate",
			],
		);
	});

	describe("the id", () => {
		test.each([
			["not text", 5],
			["not a UUID", "netflix"],
			["a UUIDv4", "9f4b8b7e-3c2a-4d11-9a7e-0123456789ab"],
			["empty", ""],
			["missing", undefined],
		])("refuses %s", (_name, id) => {
			expect(issues(subscriptionCreateSchema, create({ id }))).toEqual([
				`id: ${M.id}`,
			]);
		});
	});

	describe("the name (F05 section 8)", () => {
		test.each([
			["one character", "N", "N"],
			["60 characters", "n".repeat(60), "n".repeat(60)],
			["60 emoji, 120 UTF-16 units", "😀".repeat(60), "😀".repeat(60)],
			["spaces around it, trimmed", "  Netflix  ", "Netflix"],
			["a decomposed letter, normalized", "Café", "Café"],
			["Devanagari", "नेटफ्लिक्स", "नेटफ्लिक्स"],
		])("takes %s", (_name, name, expected) => {
			expect(subscriptionCreateSchema.parse(create({ name })).name).toBe(
				expected,
			);
		});

		test.each([
			["empty", ""],
			["spaces only", "   "],
			["only a zero-width space", "​"],
			["not text", 5],
			["null", null],
			["missing", undefined],
		])("refuses %s: Enter a name, like Netflix or Rent.", (_name, name) => {
			expect(issues(subscriptionCreateSchema, create({ name }))).toEqual([
				`name: ${M.nameRequired}`,
			]);
		});

		test.each([
			["61 characters", "n".repeat(61)],
			["61 emoji", "😀".repeat(61)],
		])("refuses %s: Use 60 characters or fewer.", (_name, name) => {
			expect(issues(subscriptionCreateSchema, create({ name }))).toEqual([
				`name: ${M.nameTooLong}`,
			]);
		});

		test.each([
			["a tab", "Net\tflix"],
			["a line feed", "Net\nflix"],
			["a control character", "Net\u0001flix"],
			["a C1 control character", "Net\u0085flix"],
			["a line separator", "Net flix"],
			["a lone surrogate", "Net\ud800flix"],
		])("refuses %s", (_name, name) => {
			expect(issues(subscriptionCreateSchema, create({ name }))).toEqual([
				"name: Remove unsupported characters.",
			]);
		});

		test("trimming happens before the length check: 60 characters and spaces", () => {
			expect(
				subscriptionCreateSchema.parse(
					create({ name: ` ${"n".repeat(60)} ` }),
				).name,
			).toBe("n".repeat(60));
		});
	});

	describe("the note", () => {
		test.each([
			["null", null, null],
			["empty", "", null],
			["spaces", "   ", null],
			["text", "Billed on the 5th", "Billed on the 5th"],
			["500 characters", "x".repeat(500), "x".repeat(500)],
			["lines", "a\nb", "a\nb"],
			["CRLF becomes LF", "a\r\nb", "a\nb"],
		])("takes %s", (_name, note, expected) => {
			expect(subscriptionCreateSchema.parse(create({ note })).note).toBe(
				expected,
			);
		});

		test("refuses 501 characters", () => {
			expect(
				issues(subscriptionCreateSchema, create({ note: "x".repeat(501) })),
			).toEqual(["note: Use 500 characters or fewer."]);
		});

		test("refuses a tab", () => {
			expect(
				issues(subscriptionCreateSchema, create({ note: "a\tb" })),
			).toEqual(["note: Remove unsupported characters."]);
		});
	});

	describe("the amount (F03's rules, MON-5)", () => {
		test.each([1, 64900, 999999999999])(
			"takes %i for a currency whose largest allows it",
			(amountMinor) => {
				expect(
					issues(
						subscriptionCreateSchema,
						create({ amountMinor, currency: "KWD" }),
					),
				).toEqual(
					amountMinor > maxMinor("KWD") ?
						[expect.stringContaining("amountMinor: The largest amount")]
					:	[],
				);
			},
		);

		test.each([
			["zero", 0],
			["negative", -1],
			["negative and large", -64900],
		])("refuses %s: Enter an amount above zero.", (_name, amountMinor) => {
			expect(
				issues(subscriptionCreateSchema, create({ amountMinor })),
			).toEqual([`amountMinor: ${M.amountZero}`]);
		});

		test.each([
			["a fraction", 649.5],
			["text", "649"],
			["NaN", Number.NaN],
			["infinity", Number.POSITIVE_INFINITY],
			["null", null],
			["missing", undefined],
		])(
			"refuses %s as not a whole number of minor units",
			(_name, amountMinor) => {
				expect(
					issues(subscriptionCreateSchema, create({ amountMinor })),
				).toEqual([`amountMinor: ${M.amountWhole}`]);
			},
		);

		test("takes the largest amount of the currency and refuses one more (MON-5)", () => {
			const largest = maxMinor("INR");
			expect(
				issues(subscriptionCreateSchema, create({ amountMinor: largest })),
			).toEqual([]);
			expect(
				issues(
					subscriptionCreateSchema,
					create({ amountMinor: largest + 1 }),
				),
			).toEqual(["amountMinor: The largest amount is 999,999,999.99."]);
		});

		test("the largest amount depends on the currency's decimals", () => {
			expect(
				issues(
					subscriptionCreateSchema,
					create({ currency: "JPY", amountMinor: maxMinor("JPY") + 1 }),
				),
			).toEqual([
				expect.stringMatching(
					/^amountMinor: The largest amount is [\d,]+\.$/,
				),
			]);
		});
	});

	describe("the currency", () => {
		test.each(["INR", "USD", "EUR", "GBP", "JPY", "KWD"])(
			"takes %s",
			(currency) => {
				expect(
					issues(subscriptionCreateSchema, create({ currency })),
				).toEqual([]);
			},
		);

		test.each([
			["unsupported", "XXX"],
			["lower case", "inr"],
			["empty", ""],
			["missing", undefined],
			["a number", 1],
		])("refuses %s", (_name, currency) => {
			expect(issues(subscriptionCreateSchema, create({ currency }))).toEqual([
				`currency: ${M.currency}`,
			]);
		});
	});

	describe("the cadence (D-90)", () => {
		test.each([
			["weekly", { unit: "week", every: 1 }],
			["every 2 weeks", { unit: "week", every: 2 }],
			["every 52 weeks", { unit: "week", every: 52 }],
			["monthly", { unit: "month", every: 1 }],
			["every 3 months", { unit: "month", every: 3 }],
			["yearly", { unit: "month", every: 12 }],
			["every 24 months", { unit: "month", every: 24 }],
		])("takes %s", (_name, cadence) => {
			expect(
				subscriptionCreateSchema.parse(create({ cadence })).cadence,
			).toEqual(cadence);
		});

		test.each([
			["0 weeks", { unit: "week", every: 0 }],
			["53 weeks", { unit: "week", every: 53 }],
			["a negative number of weeks", { unit: "week", every: -2 }],
			["a fraction of weeks", { unit: "week", every: 1.5 }],
			["text weeks", { unit: "week", every: "2" }],
			["no weeks", { unit: "week" }],
			["null weeks", { unit: "week", every: null }],
		])("refuses %s: Enter how many weeks, from 1 to 52.", (_name, cadence) => {
			expect(issues(subscriptionCreateSchema, create({ cadence }))).toEqual([
				`cadence.every: ${M.everyWeeks}`,
			]);
		});

		test.each([
			["0 months", { unit: "month", every: 0 }],
			["25 months", { unit: "month", every: 25 }],
			["52 months", { unit: "month", every: 52 }],
			["a negative number of months", { unit: "month", every: -1 }],
			["a fraction of months", { unit: "month", every: 2.5 }],
			["text months", { unit: "month", every: "3" }],
			["NaN months", { unit: "month", every: Number.NaN }],
		])("refuses %s: Enter how many months, from 1 to 24.", (_name, cadence) => {
			expect(issues(subscriptionCreateSchema, create({ cadence }))).toEqual([
				`cadence.every: ${M.everyMonths}`,
			]);
		});

		test.each([
			["a unit in days", { unit: "day", every: 10 }],
			["a unit in capitals", { unit: "WEEK", every: 1 }],
			["no unit", { every: 1 }],
			["an empty unit", { unit: "", every: 1 }],
		])("refuses %s: Choose how often it repeats.", (_name, cadence) => {
			expect(issues(subscriptionCreateSchema, create({ cadence }))).toContain(
				`cadence.unit: ${M.cadenceRequired}`,
			);
		});

		test.each([
			["a name", "monthly"],
			["null", null],
			["a number", 1],
			["an array", ["month", 1]],
			["missing", undefined],
		])("refuses %s: Choose how often it repeats.", (_name, cadence) => {
			expect(issues(subscriptionCreateSchema, create({ cadence }))).toEqual([
				`cadence: ${M.cadenceRequired}`,
			]);
		});

		test("refuses a third field", () => {
			expect(
				issues(
					subscriptionCreateSchema,
					create({ cadence: { unit: "month", every: 1, day: 5 } }),
				),
			).toEqual([expect.stringMatching(/^cadence: /)]);
		});
	});

	describe("the start date", () => {
		test("takes a real date, including a leap day", () => {
			expect(
				issues(
					subscriptionCreateSchema,
					create({ startDate: "2028-02-29" }),
				),
			).toEqual([]);
		});

		test.each([
			["an impossible date", "2026-02-30"],
			["a leap day in a common year", "2027-02-29"],
			["month 13", "2026-13-01"],
			["no zero padding", "2026-9-5"],
			["no dashes", "20260905"],
			["a time", "2026-09-05T00:00:00Z"],
			["text", "yesterday"],
			["empty", ""],
			["a number", 20260905],
			["missing", undefined],
		])("refuses %s: Use a date as YYYY-MM-DD.", (_name, startDate) => {
			expect(issues(subscriptionCreateSchema, create({ startDate }))).toEqual([
				`startDate: ${M.date}`,
			]);
		});
	});

	describe("the category (CAT-2)", () => {
		test.each([...EXPENSE_CATEGORIES])(
			"takes the expense category %s",
			(category) => {
				expect(
					issues(subscriptionCreateSchema, create({ category })),
				).toEqual([]);
			},
		);

		test.each([
			["an income category", "salary"],
			["a made-up key", "streaming"],
			["a label", "Entertainment"],
			["null", null],
			["missing", undefined],
		])("refuses %s: Choose a category.", (_name, category) => {
			expect(issues(subscriptionCreateSchema, create({ category }))).toEqual([
				`category: ${M.categoryRequired}`,
			]);
		});
	});

	describe("the past-charges choice", () => {
		test.each([
			["text", "yes"],
			["a number", 1],
			["null", null],
		])("refuses %s: Send true or false.", (_name, backfill) => {
			expect(issues(subscriptionCreateSchema, create({ backfill }))).toEqual([
				`backfill: ${M.boolean}`,
			]);
		});
	});

	describe("createdAt", () => {
		test.each([
			["a time in UTC", "2026-11-02T06:30:00Z"],
			["with milliseconds", "2026-11-02T06:30:00.123Z"],
			["with seconds", "2026-11-02T06:30:45Z"],
		])("takes %s", (_name, createdAt) => {
			expect(issues(subscriptionCreateSchema, create({ createdAt }))).toEqual(
				[],
			);
		});

		test.each([
			["a date only", "2026-11-02"],
			["an offset", "2026-11-02T12:00:00+05:30"],
			["no zone", "2026-11-02T06:30:00"],
			["an impossible date", "2026-02-30T06:30:00Z"],
			["hour 24", "2026-11-02T24:00:00Z"],
			["a number", 1793600000000],
			["missing", undefined],
		])("refuses %s: Use an ISO date and time in UTC.", (_name, createdAt) => {
			expect(issues(subscriptionCreateSchema, create({ createdAt }))).toEqual([
				`createdAt: ${M.instant}`,
			]);
		});
	});

	describe("fields Daybook sets are refused by name", () => {
		test.each([
			["chargesFrom", "2026-09-05"],
			["lastChangeOn", "2026-09-05"],
			["demo", true],
			["version", 3],
			["updatedAt", NOW_TEXT],
			["skips", []],
			["status", "active"],
			["nextDueOn", "2026-11-05"],
			["yearlyMinor", 778800],
			["monthlyMinor", 64900],
			["chargeCount", 2],
			["paidMinor", 129800],
		])("%s", (field, value) => {
			expect(
				issues(subscriptionCreateSchema, create({ [field]: value })),
			).toEqual([`${field}: ${M.systemField}`]);
		});

		test.each([
			["endDate", "2026-12-31"],
			["pause", { from: "2026-11-05", until: "2027-01-05" }],
		])("%s: add the Subscription first", (field, value) => {
			expect(
				issues(subscriptionCreateSchema, create({ [field]: value })),
			).toEqual([`${field}: ${M.notOnCreate}`]);
		});
	});

	test("refuses a field it does not know", () => {
		expect(issues(subscriptionCreateSchema, create({ colour: "red" }))).toEqual([
			expect.stringMatching(/^: /),
		]);
	});

	test.each([[null], [[]], ["Netflix"], [5], [undefined]])(
		"refuses %j as a body",
		(body) => {
			expect(subscriptionCreateSchema.safeParse(body).success).toBe(false);
		},
	);

	test("reports every problem at once, each on its field", () => {
		expect(
			issues(
				subscriptionCreateSchema,
				create({ name: "", amountMinor: 0, category: "salary" }),
			),
		).toEqual([
			`name: ${M.nameRequired}`,
			`amountMinor: ${M.amountZero}`,
			`category: ${M.categoryRequired}`,
		]);
	});
});

describe("subscriptionEditSchema (F05 section 11)", () => {
	test("takes an amount with its currency", () => {
		expect(subscriptionEditSchema.parse(edit())).toEqual({
			changedAt: NOW_TEXT,
			amountMinor: 79900,
			currency: "INR",
		});
	});

	test("gives back only the fields that were sent", () => {
		const body = subscriptionEditSchema.parse({
			changedAt: NOW_TEXT,
			name: "Netflix Premium",
		});
		expect(Object.keys(body).sort()).toEqual(["changedAt", "name"]);
		expect("note" in body).toBe(false);
	});

	test.each([
		["a name", { name: "Netflix Premium" }],
		["a category", { category: "shopping" }],
		["a cadence", { cadence: { unit: "week", every: 2 } }],
		["a start date", { startDate: "2026-09-15" }],
		["a note", { note: "Family plan" }],
		["an end date", { endDate: "2026-09-30" }],
		["clearing the end date", { endDate: null }],
		["a pause", { pause: { from: "2026-11-05", until: "2027-01-05" } }],
		["clearing the pause", { pause: null }],
	])("takes %s alone", (_name, changes) => {
		expect(
			issues(subscriptionEditSchema, { changedAt: NOW_TEXT, ...changes }),
		).toEqual([]);
	});

	describe("changedAt", () => {
		test.each([
			["missing", undefined],
			["a date only", "2026-11-02"],
			["an offset", "2026-11-02T12:00:00+05:30"],
			["a number", 5],
		])("refuses %s", (_name, changedAt) => {
			expect(issues(subscriptionEditSchema, edit({ changedAt }))).toEqual([
				`changedAt: ${M.instant}`,
			]);
		});
	});

	describe("a change is needed", () => {
		test("changedAt alone is nothing to change", () => {
			expect(issues(subscriptionEditSchema, { changedAt: NOW_TEXT })).toEqual([
				`: ${M.nothingToChange}`,
			]);
		});

		test("an empty body asks for a time and a change", () => {
			// A field that fails stops the object-level check, so the missing change shows once changedAt is fixed.
			expect(issues(subscriptionEditSchema, {})).toEqual([
				`changedAt: ${M.instant}`,
			]);
		});

		test.each([
			["backfillGap", { backfillGap: true }],
			["alsoPastCharges", { alsoPastCharges: true }],
			["skipDueOn", { skipDueOn: "2026-11-15" }],
			["unskipDueOn", { unskipDueOn: "2026-11-15" }],
			["a currency", { currency: "INR" }],
		])("%s alone is not a change", (_name, options) => {
			expect(
				issues(subscriptionEditSchema, { changedAt: NOW_TEXT, ...options }),
			).toContain(`: ${M.nothingToChange}`);
		});
	});

	describe("the amount", () => {
		test("an amount without its currency is refused", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					amountMinor: 79900,
				}),
			).toEqual([`currency: ${M.currencyWithAmount}`]);
		});

		test("a currency may come with another change", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					name: "Netflix",
					currency: "INR",
				}),
			).toEqual([]);
		});

		test("follows the create rules for the value", () => {
			expect(issues(subscriptionEditSchema, edit({ amountMinor: 0 }))).toEqual(
				[`amountMinor: ${M.amountZero}`],
			);
			expect(
				issues(subscriptionEditSchema, edit({ amountMinor: 1.5 })),
			).toEqual([`amountMinor: ${M.amountWhole}`]);
			expect(
				issues(subscriptionEditSchema, edit({ currency: "XXX" })),
			).toEqual([`currency: ${M.currency}`]);
		});

		test("takes the largest amount and refuses one more", () => {
			expect(
				issues(
					subscriptionEditSchema,
					edit({ amountMinor: maxMinor("INR") }),
				),
			).toEqual([]);
			expect(
				issues(
					subscriptionEditSchema,
					edit({ amountMinor: maxMinor("INR") + 1 }),
				),
			).toEqual(["amountMinor: The largest amount is 999,999,999.99."]);
		});
	});

	describe("text", () => {
		test("an empty name is refused, not cleared", () => {
			expect(
				issues(subscriptionEditSchema, { changedAt: NOW_TEXT, name: "" }),
			).toEqual([`name: ${M.nameRequired}`]);
		});

		test("an over-long name is refused", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					name: "n".repeat(61),
				}),
			).toEqual([`name: ${M.nameTooLong}`]);
		});

		test("a name is trimmed and normalized", () => {
			expect(
				subscriptionEditSchema.parse({
					changedAt: NOW_TEXT,
					name: "  Café ",
				}).name,
			).toBe("Café");
		});

		test("an empty note is sent as a note that is cleared: null", () => {
			expect(
				subscriptionEditSchema.parse({ changedAt: NOW_TEXT, note: "" }).note,
			).toBeNull();
			expect(
				subscriptionEditSchema.parse({ changedAt: NOW_TEXT, note: null })
					.note,
			).toBeNull();
		});

		test("a note left out stays out", () => {
			expect("note" in subscriptionEditSchema.parse(edit())).toBe(false);
		});

		test("an over-long note is refused", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					note: "x".repeat(501),
				}),
			).toEqual(["note: Use 500 characters or fewer."]);
		});
	});

	describe("the cadence, category and dates", () => {
		test("a cadence is judged with its unit", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					cadence: { unit: "week", every: 53 },
				}),
			).toEqual([`cadence.every: ${M.everyWeeks}`]);
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					cadence: { unit: "month", every: 25 },
				}),
			).toEqual([`cadence.every: ${M.everyMonths}`]);
		});

		test("a category must be an expense category", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					category: "salary",
				}),
			).toEqual([`category: ${M.categoryRequired}`]);
		});

		test.each([
			["startDate", "2026-02-30"],
			["endDate", "2026-02-30"],
			["skipDueOn", "15 Nov"],
			["unskipDueOn", "2026-13-01"],
		])("%s must be a real date", (field, value) => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					name: "Netflix",
					[field]: value,
				}),
			).toContain(`${field}: ${M.date}`);
		});

		test("an end date of null clears it, and a number is refused", () => {
			expect(
				subscriptionEditSchema.parse({ changedAt: NOW_TEXT, endDate: null })
					.endDate,
			).toBeNull();
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					endDate: 20261231,
				}),
			).toEqual([`endDate: ${M.date}`]);
		});
	});

	describe("the pause", () => {
		test("takes from and until", () => {
			expect(
				subscriptionEditSchema.parse({
					changedAt: NOW_TEXT,
					pause: { from: "2026-11-05", until: "2027-01-05" },
				}).pause,
			).toEqual({ from: "2026-11-05", until: "2027-01-05" });
		});

		test.each([
			["no until", { from: "2026-11-05" }],
			["no from", { until: "2027-01-05" }],
			["a bad date", { from: "2026-11-05", until: "2027-02-30" }],
			["a third field", { from: "2026-11-05", until: "2027-01-05", count: 2 }],
			["text", "paused"],
		])("refuses %s", (_name, pause) => {
			expect(
				issues(subscriptionEditSchema, { changedAt: NOW_TEXT, pause }),
			).not.toEqual([]);
		});
	});

	describe("the options", () => {
		test("alsoPastCharges goes with a name or a category", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					name: "Netflix Premium",
					alsoPastCharges: true,
				}),
			).toEqual([]);
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					category: "shopping",
					alsoPastCharges: true,
				}),
			).toEqual([]);
		});

		test("alsoPastCharges with only an amount or a note is refused", () => {
			expect(
				issues(subscriptionEditSchema, edit({ alsoPastCharges: true })),
			).toEqual([`alsoPastCharges: ${M.alsoPastWithValue}`]);
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					note: "x",
					alsoPastCharges: true,
				}),
			).toEqual([`alsoPastCharges: ${M.alsoPastWithValue}`]);
		});

		test("alsoPastCharges false is no request, so it goes with anything", () => {
			expect(
				issues(subscriptionEditSchema, edit({ alsoPastCharges: false })),
			).toEqual([]);
		});

		test("skipDueOn goes with a start or a cadence change", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					startDate: "2026-09-15",
					skipDueOn: "2026-11-15",
				}),
			).toEqual([]);
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					cadence: { unit: "week", every: 2 },
					skipDueOn: "2026-11-15",
				}),
			).toEqual([]);
		});

		test("skipDueOn with only a value or an end change is refused", () => {
			expect(
				issues(subscriptionEditSchema, edit({ skipDueOn: "2026-11-15" })),
			).toEqual([`skipDueOn: ${M.skipDueOnWithSchedule}`]);
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					endDate: null,
					skipDueOn: "2026-11-15",
				}),
			).toEqual([`skipDueOn: ${M.skipDueOnWithSchedule}`]);
		});

		test("unskipDueOn goes with any change: the Undo of an edit", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					startDate: "2026-09-05",
					unskipDueOn: "2026-11-15",
				}),
			).toEqual([]);
			expect(
				issues(subscriptionEditSchema, edit({ unskipDueOn: "2026-11-15" })),
			).toEqual([]);
		});

		test("skipDueOn and unskipDueOn together are refused", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					startDate: "2026-09-15",
					skipDueOn: "2026-11-15",
					unskipDueOn: "2026-11-15",
				}),
			).toEqual([`unskipDueOn: ${M.skipBoth}`]);
		});

		test("backfillGap goes with an end date, a date or null", () => {
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					endDate: null,
					backfillGap: true,
				}),
			).toEqual([]);
			expect(
				issues(subscriptionEditSchema, {
					changedAt: NOW_TEXT,
					endDate: "2026-12-31",
					backfillGap: true,
				}),
			).toEqual([]);
		});

		test("backfillGap without an end date is refused; false is no request", () => {
			expect(
				issues(subscriptionEditSchema, edit({ backfillGap: true })),
			).toEqual([`backfillGap: ${M.backfillGapWithEnd}`]);
			expect(
				issues(subscriptionEditSchema, edit({ backfillGap: false })),
			).toEqual([]);
		});

		test.each(["alsoPastCharges", "backfillGap"])(
			"%s must be true or false",
			(field) => {
				expect(
					issues(subscriptionEditSchema, {
						changedAt: NOW_TEXT,
						name: "Netflix",
						endDate: null,
						[field]: "yes",
					}),
				).toContain(`${field}: ${M.boolean}`);
			},
		);
	});

	describe("fields the client may not send", () => {
		test.each([
			["chargesFrom", "2026-09-05"],
			["lastChangeOn", "2026-09-05"],
			["demo", true],
			["version", 3],
			["updatedAt", NOW_TEXT],
			["skips", []],
			["status", "active"],
			["nextDueOn", "2026-11-05"],
			["yearlyMinor", 778800],
			["monthlyMinor", 64900],
			["chargeCount", 2],
			["paidMinor", 129800],
			["id", ID],
		])("%s is Daybook's", (field, value) => {
			expect(issues(subscriptionEditSchema, edit({ [field]: value }))).toEqual(
				[`${field}: ${M.systemField}`],
			);
		});

		test("createdAt can't change", () => {
			expect(
				issues(subscriptionEditSchema, edit({ createdAt: NOW_TEXT })),
			).toEqual([`createdAt: ${M.createdAtFixed}`]);
		});

		test("an unknown field is refused", () => {
			expect(issues(subscriptionEditSchema, edit({ colour: "red" }))).toEqual([
				expect.stringMatching(/^: /),
			]);
		});
	});

	test.each([[null], [[]], ["Netflix"], [undefined]])(
		"refuses %j as a body",
		(body) => {
			expect(subscriptionEditSchema.safeParse(body).success).toBe(false);
		},
	);
});

describe("subscriptionDeleteSchema (BR-F05-14, BR-F05-34)", () => {
	test("takes changedAt", () => {
		expect(subscriptionDeleteSchema.parse({ changedAt: NOW_TEXT })).toEqual({
			changedAt: NOW_TEXT,
		});
	});

	test("takes the undo of a create", () => {
		expect(
			subscriptionDeleteSchema.parse({ changedAt: NOW_TEXT, undo: "create" }),
		).toEqual({
			changedAt: NOW_TEXT,
			undo: "create",
		});
	});

	test.each([["delete"], [""], [true], [null]])("refuses undo %j", (undo) => {
		expect(
			issues(subscriptionDeleteSchema, { changedAt: NOW_TEXT, undo }),
		).toEqual([`undo: ${M.undo}`]);
	});

	test("needs changedAt", () => {
		expect(issues(subscriptionDeleteSchema, {})).toEqual([
			`changedAt: ${M.instant}`,
		]);
		expect(issues(subscriptionDeleteSchema, { changedAt: "yesterday" })).toEqual(
			[`changedAt: ${M.instant}`],
		);
	});

	test("refuses any other field", () => {
		expect(
			issues(subscriptionDeleteSchema, { changedAt: NOW_TEXT, hard: true }),
		).toEqual([expect.stringMatching(/^: /)]);
	});
});

describe("subscriptionSkipSchema and subscriptionUnskipSchema (BR-F05-26, BR-F05-27)", () => {
	test("a skip takes dueOn and changedAt", () => {
		expect(
			subscriptionSkipSchema.parse({
				dueOn: "2026-11-05",
				changedAt: NOW_TEXT,
			}),
		).toEqual({
			dueOn: "2026-11-05",
			changedAt: NOW_TEXT,
		});
	});

	test("a skip needs both, each well formed", () => {
		expect(issues(subscriptionSkipSchema, { changedAt: NOW_TEXT })).toEqual([
			`dueOn: ${M.date}`,
		]);
		expect(issues(subscriptionSkipSchema, { dueOn: "2026-11-05" })).toEqual([
			`changedAt: ${M.instant}`,
		]);
		expect(
			issues(subscriptionSkipSchema, {
				dueOn: "2026-02-30",
				changedAt: NOW_TEXT,
			}),
		).toEqual([`dueOn: ${M.date}`]);
	});

	test("a skip refuses any other field", () => {
		expect(
			issues(subscriptionSkipSchema, {
				dueOn: "2026-11-05",
				changedAt: NOW_TEXT,
				version: 2,
			}),
		).toEqual([expect.stringMatching(/^: /)]);
	});

	test("an undo of a skip takes changedAt alone", () => {
		expect(subscriptionUnskipSchema.parse({ changedAt: NOW_TEXT })).toEqual({
			changedAt: NOW_TEXT,
		});
		expect(issues(subscriptionUnskipSchema, {})).toEqual([
			`changedAt: ${M.instant}`,
		]);
		expect(
			issues(subscriptionUnskipSchema, {
				changedAt: NOW_TEXT,
				dueOn: "2026-11-05",
			}),
		).toEqual([expect.stringMatching(/^: /)]);
	});

	test("the path's date must be real", () => {
		expect(skipDateParamSchema.safeParse("2026-11-05").success).toBe(true);
		for (const bad of [
			"2026-11-5",
			"2026-02-30",
			"nov",
			"",
			"2026-11-05T00:00:00Z",
		]) {
			expect(skipDateParamSchema.safeParse(bad).success).toBe(false);
		}
	});
});

describe("subscriptionMonthsQuerySchema (BR-F05-36, AC-F05-24)", () => {
	test("takes a range", () => {
		expect(
			subscriptionMonthsQuerySchema.parse({ from: "2026-10", to: "2026-12" }),
		).toEqual({
			from: "2026-10",
			to: "2026-12",
		});
	});

	test("takes one month", () => {
		expect(
			issues(subscriptionMonthsQuerySchema, {
				from: "2026-11",
				to: "2026-11",
			}),
		).toEqual([]);
	});

	test("takes 24 months, and refuses 25", () => {
		expect(
			issues(subscriptionMonthsQuerySchema, {
				from: "2026-10",
				to: "2028-09",
			}),
		).toEqual([]);
		expect(
			issues(subscriptionMonthsQuerySchema, {
				from: "2026-10",
				to: "2028-10",
			}),
		).toEqual([`to: ${M.monthsSpan}`]);
	});

	test("refuses a first month after the last", () => {
		expect(
			issues(subscriptionMonthsQuerySchema, {
				from: "2026-12",
				to: "2026-10",
			}),
		).toEqual([`from: ${M.monthsOrder}`]);
	});

	test.each([
		["one digit", "2026-1"],
		["month 13", "2026-13"],
		["month 00", "2026-00"],
		["a full date", "2026-10-01"],
		["text", "october"],
		["empty", ""],
		["missing", undefined],
	])("refuses %s: Use a month as YYYY-MM.", (_name, from) => {
		expect(
			issues(subscriptionMonthsQuerySchema, { from, to: "2026-12" }),
		).toEqual([`from: ${M.month}`]);
	});

	test("refuses a missing last month and any other parameter", () => {
		expect(issues(subscriptionMonthsQuerySchema, { from: "2026-10" })).toEqual([
			`to: ${M.month}`,
		]);
		expect(
			issues(subscriptionMonthsQuerySchema, {
				from: "2026-10",
				to: "2026-12",
				sort: "asc",
			}),
		).toEqual([expect.stringMatching(/^: /)]);
	});

	describe("the window (D-596)", () => {
		test("is 120 months either side of the current month", () => {
			expect(monthsWindow("2026-11")).toEqual({
				first: "2016-11",
				last: "2036-11",
			});
		});

		test("takes both ends", () => {
			expect(
				monthsWindowIssues({ from: "2016-11", to: "2036-11" }, "2026-11"),
			).toEqual([]);
		});

		test("refuses a first month before it and a last month after it", () => {
			const text = "Choose months from Nov 2016 to Nov 2036.";
			expect(
				monthsWindowIssues({ from: "2016-10", to: "2026-11" }, "2026-11"),
			).toEqual([{ path: ["from"], message: text }]);
			expect(
				monthsWindowIssues({ from: "2026-11", to: "2036-12" }, "2026-11"),
			).toEqual([{ path: ["to"], message: text }]);
			expect(
				monthsWindowIssues({ from: "2016-10", to: "2036-12" }, "2026-11"),
			).toHaveLength(2);
		});

		test("moves with the current month", () => {
			expect(monthsWindow("2027-01")).toEqual({
				first: "2017-01",
				last: "2037-01",
			});
		});
	});
});

describe("the windows that need the clock (D-257, D-267, BR-P2-43)", () => {
	describe("instantProblem", () => {
		test("exactly 90 days back is allowed; a millisecond more is too old", () => {
			expect(INSTANT_WINDOW).toEqual({ daysBack: 90, minutesAhead: 5 });
			expect(
				instantProblem(
					new Date(NOW.getTime() - 90 * DAY).toISOString(),
					NOW,
				),
			).toBeNull();
			expect(
				instantProblem(
					new Date(NOW.getTime() - 90 * DAY - 1).toISOString(),
					NOW,
				),
			).toBe("old");
		});

		// AC-F05-11: a changedAt 91 days old.
		test("91 days old is too old", () => {
			expect(
				instantProblem(
					new Date(NOW.getTime() - 91 * DAY).toISOString(),
					NOW,
				),
			).toBe("old");
		});

		test("exactly 5 minutes ahead is allowed; a millisecond more is in the future", () => {
			expect(
				instantProblem(
					new Date(NOW.getTime() + 5 * 60_000).toISOString(),
					NOW,
				),
			).toBeNull();
			expect(
				instantProblem(
					new Date(NOW.getTime() + 5 * 60_000 + 1).toISOString(),
					NOW,
				),
			).toBe("future");
		});

		test("now, and a day ago, are fine", () => {
			expect(instantProblem(NOW_TEXT, NOW)).toBeNull();
			expect(
				instantProblem(new Date(NOW.getTime() - DAY).toISOString(), NOW),
			).toBeNull();
		});
	});

	describe("changedAtIssues", () => {
		test("a fresh time has none", () => {
			expect(changedAtIssues(NOW_TEXT, NOW)).toEqual([]);
		});

		test("a time 91 days old: This change is too old to apply", () => {
			expect(
				changedAtIssues(
					new Date(NOW.getTime() - 91 * DAY).toISOString(),
					NOW,
				),
			).toEqual([{ path: ["changedAt"], message: M.changeTooOld }]);
		});

		test("a time a minute past the allowance is in the future", () => {
			expect(
				changedAtIssues(
					new Date(NOW.getTime() + 6 * 60_000).toISOString(),
					NOW,
				),
			).toEqual([{ path: ["changedAt"], message: M.changeInFuture }]);
		});
	});

	describe("startDateWindow (D-257)", () => {
		test("golden: from 2 Nov 2016 to 2 Nov 2027", () => {
			expect(startDateWindow("2026-11-02")).toEqual({
				min: "2016-11-02",
				max: "2027-11-02",
			});
		});

		test("a leap day clamps both ends", () => {
			expect(startDateWindow("2028-02-29")).toEqual({
				min: "2018-02-28",
				max: "2029-02-28",
			});
		});

		test("the 31st clamps in a short month", () => {
			expect(startDateWindow("2026-03-31")).toEqual({
				min: "2016-03-31",
				max: "2027-03-31",
			});
			expect(startDateWindow("2026-02-28")).toEqual({
				min: "2016-02-28",
				max: "2027-02-28",
			});
		});
	});

	test("an end date may be up to 10 years after the change date", () => {
		expect(endDateMax("2026-11-02")).toBe("2036-11-02");
		expect(endDateMax("2028-02-29")).toBe("2038-02-28");
	});

	describe("createWindowIssues", () => {
		const body = (
			changes: Partial<{
				id: string;
				createdAt: string;
				startDate: string;
			}> = {},
		) => ({
			id: uuidV7(NOW.getTime()),
			createdAt: NOW_TEXT,
			startDate: "2026-09-05",
			...changes,
		});
		const check = (input: ReturnType<typeof body>, timezone = "Asia/Kolkata") =>
			createWindowIssues(input, { now: NOW, timezone });

		test("a golden create has none", () => {
			expect(check(body())).toEqual([]);
		});

		test("an id up to 5 minutes ahead is fine, 6 minutes is not (BR-P2-43)", () => {
			expect(check(body({ id: uuidV7(NOW.getTime() + 5 * 60_000) }))).toEqual(
				[],
			);
			expect(check(body({ id: uuidV7(NOW.getTime() + 6 * 60_000) }))).toEqual([
				{ path: ["id"], message: M.idInFuture },
			]);
		});

		test("an old id is fine: it may have waited in a queue", () => {
			expect(check(body({ id: uuidV7(NOW.getTime() - 200 * DAY) }))).toEqual(
				[],
			);
		});

		test("createdAt from 90 days back to 5 minutes ahead", () => {
			expect(
				check(
					body({
						createdAt: new Date(NOW.getTime() - 90 * DAY).toISOString(),
					}),
				),
			).toEqual([]);
			expect(
				check(
					body({
						createdAt: new Date(NOW.getTime() - 91 * DAY).toISOString(),
					}),
				),
			).toContainEqual({
				path: ["createdAt"],
				message: M.changeTooOld,
			});
			expect(
				check(
					body({
						createdAt: new Date(
							NOW.getTime() + 6 * 60_000,
						).toISOString(),
					}),
				),
			).toContainEqual({
				path: ["createdAt"],
				message: M.createdAtInFuture,
			});
		});

		// AC-F05-11: a startDate 11 years back.
		test("a start date 11 years back: Choose a date from 2 Nov 2016 to 2 Nov 2027.", () => {
			expect(check(body({ startDate: "2015-11-02" }))).toEqual([
				{
					path: ["startDate"],
					message: "Choose a date from 2 Nov 2016 to 2 Nov 2027.",
				},
			]);
		});

		test("a start date exactly 10 years back and exactly 1 year ahead are fine", () => {
			expect(check(body({ startDate: "2016-11-02" }))).toEqual([]);
			expect(check(body({ startDate: "2027-11-02" }))).toEqual([]);
		});

		test("a start date a day outside either end is refused", () => {
			expect(check(body({ startDate: "2016-11-01" }))).toHaveLength(1);
			expect(check(body({ startDate: "2027-11-03" }))).toHaveLength(1);
		});

		test("the window is read from the recording date, the day the create was made", () => {
			const createdAt = "2026-10-30T10:00:00Z";
			// Recorded 30 Oct: 10 years back is 30 Oct 2016, which today's window would refuse.
			expect(check(body({ createdAt, startDate: "2016-10-30" }))).toEqual([]);
			expect(check(body({ createdAt, startDate: "2016-10-29" }))).toEqual([
				{
					path: ["startDate"],
					message: "Choose a date from 30 Oct 2016 to 30 Oct 2027.",
				},
			]);
		});

		test("the recording date is read in the profile zone", () => {
			// 19:00 UTC on 1 Nov is already 2 Nov in Kolkata and still 1 Nov in Los Angeles.
			const createdAt = "2026-11-01T19:00:00Z";
			expect(
				check(body({ createdAt, startDate: "2016-11-02" }), "Asia/Kolkata"),
			).toEqual([]);
			expect(
				check(
					body({ createdAt, startDate: "2016-11-01" }),
					"America/Los_Angeles",
				),
			).toEqual([]);
			expect(
				check(body({ createdAt, startDate: "2016-11-01" }), "Asia/Kolkata"),
			).toHaveLength(1);
		});

		test("reports each problem on its own field", () => {
			expect(
				check(
					body({
						id: uuidV7(NOW.getTime() + 60 * 60_000),
						createdAt: new Date(NOW.getTime() - 100 * DAY).toISOString(),
						startDate: "2001-01-01",
					}),
				).map((issue) => issue.path[0]),
			).toEqual(["id", "createdAt", "startDate"]);
		});
	});

	describe("editWindowIssues", () => {
		const C = "2026-11-02";

		test("nothing sent, nothing to check", () => {
			expect(editWindowIssues({}, C)).toEqual([]);
			expect(editWindowIssues({ endDate: null }, C)).toEqual([]);
		});

		test("a start date within 10 years back and 1 year ahead of C", () => {
			expect(editWindowIssues({ startDate: "2016-11-02" }, C)).toEqual([]);
			expect(editWindowIssues({ startDate: "2027-11-02" }, C)).toEqual([]);
			expect(editWindowIssues({ startDate: "2016-11-01" }, C)).toEqual([
				{
					path: ["startDate"],
					message: "Choose a date from 2 Nov 2016 to 2 Nov 2027.",
				},
			]);
			expect(editWindowIssues({ startDate: "2027-11-03" }, C)).toHaveLength(1);
		});

		test("the start window moves with C, not with today", () => {
			expect(
				editWindowIssues({ startDate: "2016-11-02" }, "2026-10-01"),
			).toEqual([]);
			expect(
				editWindowIssues({ startDate: "2016-11-02" }, "2026-11-04"),
			).toEqual([
				{
					path: ["startDate"],
					message: "Choose a date from 4 Nov 2016 to 4 Nov 2027.",
				},
			]);
		});

		test("an end date up to 10 years after C", () => {
			expect(editWindowIssues({ endDate: "2036-11-02" }, C)).toEqual([]);
			expect(editWindowIssues({ endDate: "2036-11-03" }, C)).toEqual([
				{
					path: ["endDate"],
					message: "Choose an end date up to 2 Nov 2036.",
				},
			]);
		});

		test("an end date in the past is a window matter for the merged start date, not this check", () => {
			expect(editWindowIssues({ endDate: "2020-01-01" }, C)).toEqual([]);
		});

		test("reports both fields together", () => {
			expect(
				editWindowIssues(
					{ startDate: "1999-01-01", endDate: "2099-01-01" },
					C,
				),
			).toHaveLength(2);
		});
	});

	describe("endDateIssues", () => {
		test("an end date before the start date: The end date can't be before the start date.", () => {
			expect(endDateIssues("2026-09-05", "2026-09-04")).toEqual([
				{
					path: ["endDate"],
					message: "The end date can't be before the start date.",
				},
			]);
		});

		test("the start date itself, a later date and no end date are fine", () => {
			expect(endDateIssues("2026-09-05", "2026-09-05")).toEqual([]);
			expect(endDateIssues("2026-09-05", "2027-09-05")).toEqual([]);
			expect(endDateIssues("2026-09-05", null)).toEqual([]);
		});
	});
});
