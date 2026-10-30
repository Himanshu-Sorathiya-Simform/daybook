import { describe, expect, test } from "vitest";
import type { z } from "zod";

import {
	GOLDEN_ALL,
	GOLDEN_GOALS,
	GOLDEN_SUBSCRIPTIONS,
	goldenRow,
	type GoldenTransaction,
} from "../../../../seed/golden";
import type { CurrencyCode } from "@/lib/currency";
import { TXN_TYPES, type TxnType } from "@/lib/transactions/model";
import {
	occurredOnFits,
	transactionCreateSchema,
	transactionDeleteSchema,
	transactionEditSchema,
	typeChangeAllowed,
	typeRuleIssues,
	type Transaction,
} from "@/lib/transactions/schemas";

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c01";

/** The create body the dialog sends for a golden row (F03 section 15). */
function bodyOf(row: GoldenTransaction): Record<string, unknown> {
	return {
		id: row.id,
		type: row.type,
		amountMinor: row.amountMinor,
		currency: "INR",
		occurredAt: row.occurredAt,
		occurredOn: row.occurredOn,
		createdAt: row.createdAt,
		...(row.category === null ? {} : { category: row.category }),
		...(row.goalId === null ? {} : { goalId: row.goalId }),
		...(row.payee === null ? {} : { payee: row.payee }),
		description: row.description,
		note: row.note,
	};
}

// golden: Transaction #24, Swiggy, 640.00, as F03 section 15 illustrates it.
const EXPENSE = {
	id: ID,
	type: "expense",
	amountMinor: 64000,
	currency: "INR",
	occurredAt: "2026-10-19T16:45:00Z",
	occurredOn: "2026-10-19",
	createdAt: "2026-10-19T16:46:12Z",
	category: "food",
	payee: "Swiggy",
	description: null,
	note: null,
};
const CONTRIBUTION = {
	...EXPENSE,
	type: "goal_contribution",
	goalId: GOLDEN_GOALS.vacation.id,
	category: undefined,
	payee: undefined,
};

/** Each field's first message when `body` is refused, keyed by its dotted path. */
function messages(schema: z.ZodType, body: unknown) {
	const result = schema.safeParse(body);
	if (result.success) return {};
	const fields: Record<string, string> = {};
	for (const issue of result.error.issues) {
		fields[issue.path.join(".") || "_body"] ??= issue.message;
	}
	return fields;
}
const createErrors = (changes: Record<string, unknown>) =>
	messages(transactionCreateSchema, { ...EXPENSE, ...changes });
const editErrors = (body: Record<string, unknown>) =>
	messages(transactionEditSchema, body);

describe("the create body (F03 section 11)", () => {
	test("accepts the spec's illustrated create request", () => {
		expect(transactionCreateSchema.parse(EXPENSE)).toEqual({
			...EXPENSE,
			goalId: null,
		});
	});

	test.each(GOLDEN_ALL.map((row) => [row.golden, row] as const))(
		"accepts golden row #%i as a create body",
		(_golden, row) => {
			expect(transactionCreateSchema.safeParse(bodyOf(row)).success).toBe(
				true,
			);
		},
	);

	test("normalizes text and fills absent optional fields with null", () => {
		const parsed = transactionCreateSchema.parse({
			...EXPENSE,
			payee: "  Café Day ",
			description: "  ",
			note: "Line 1\r\nLine 2",
		});
		expect(parsed).toMatchObject({
			payee: "Café Day",
			description: null,
			note: "Line 1\nLine 2",
			goalId: null,
		});
		const withoutOptional = Object.fromEntries(
			Object.entries(EXPENSE).filter(
				([key]) => key !== "description" && key !== "note",
			),
		);
		expect(transactionCreateSchema.parse(withoutOptional)).toMatchObject({
			description: null,
			note: null,
		});
	});

	test("lowercases the id", () => {
		expect(
			transactionCreateSchema.parse({ ...EXPENSE, id: ID.toUpperCase() }).id,
		).toBe(ID);
	});

	describe("type rules (BR-F03-01, TXN-1 to TXN-4)", () => {
		// AC-F03-09, at the schema level.
		test("an income with an expense category is refused", () => {
			expect(createErrors({ type: "income", category: "food" })).toEqual({
				category: "Choose a category.",
			});
		});

		test("an expense with an income category is refused", () => {
			expect(createErrors({ category: "salary" })).toEqual({
				category: "Choose a category.",
			});
		});

		test("a refund takes an expense category", () => {
			expect(createErrors({ type: "refund", category: "shopping" })).toEqual(
				{},
			);
		});

		test("an unknown category is refused", () => {
			expect(createErrors({ category: "pizza" })).toEqual({
				category: "Choose a category.",
			});
		});

		test.each(["income", "expense", "refund"])("%s needs a category", (type) => {
			expect(createErrors({ type, category: undefined })).toEqual({
				category: "Choose a category.",
			});
		});

		test.each(["income", "expense", "refund"])("%s needs a payee", (type) => {
			const category = type === "income" ? "salary" : "food";
			for (const payee of [undefined, null, "", "   "]) {
				expect(createErrors({ type, category, payee })).toEqual({
					payee: "Enter who you paid, or who paid you.",
				});
			}
		});

		test.each(["income", "expense", "refund"])("%s refuses a Goal", (type) => {
			const category = type === "income" ? "salary" : "food";
			expect(
				createErrors({ type, category, goalId: GOLDEN_GOALS.vacation.id }),
			).toEqual({
				goalId: "Only Goal Transactions have a Goal.",
			});
		});

		test.each(["goal_contribution", "goal_withdrawal"])(
			"%s needs a Goal",
			(type) => {
				expect(
					messages(transactionCreateSchema, {
						...CONTRIBUTION,
						type,
						goalId: undefined,
					}),
				).toEqual({
					goalId: "Choose a Goal.",
				});
			},
		);

		// AC-F03-09: a payee on a goal_contribution is refused, never dropped.
		test.each([
			["payee", "Swiggy", "Goal Transactions have no payee."],
			["category", "food", "Goal Transactions have no category."],
			["description", "For March", "Goal Transactions have no description."],
		])("a Goal Transaction refuses a %s", (field, value, message) => {
			expect(
				messages(transactionCreateSchema, {
					...CONTRIBUTION,
					[field]: value,
				}),
			).toEqual({
				[field]: message,
			});
		});

		test("a Goal Transaction takes a note", () => {
			expect(
				transactionCreateSchema.parse({
					...CONTRIBUTION,
					note: "Bonus month",
				}),
			).toMatchObject({ note: "Bonus month", payee: null, category: null });
		});

		test("a Goal id must be a UUID", () => {
			expect(
				messages(transactionCreateSchema, {
					...CONTRIBUTION,
					goalId: "vacation",
				}),
			).toEqual({
				goalId: "Choose a Goal.",
			});
		});

		test("an unknown type is refused", () => {
			expect(createErrors({ type: "transfer" })).toEqual({
				type: "Choose a type.",
			});
		});
	});

	describe("amounts (BR-F03-03, MON-1, MON-5)", () => {
		test.each([0, -5])("refuses %i as not above zero", (amountMinor) => {
			expect(createErrors({ amountMinor })).toEqual({
				amountMinor: "Enter an amount above zero.",
			});
		});

		test.each([640.5, "64000", null, Number.NaN, Number.POSITIVE_INFINITY])(
			"refuses %j as not a whole number of minor units",
			(amountMinor) => {
				expect(createErrors({ amountMinor })).toEqual({
					amountMinor: "Send the amount as a whole number of minor units.",
				});
			},
		);

		test.each([
			["INR", 99999999999, "The largest amount is 999,999,999.99."],
			["USD", 99999999999, "The largest amount is 999,999,999.99."],
			["JPY", 999999999, "The largest amount is 999,999,999."],
			["KWD", 999999999999, "The largest amount is 999,999,999.999."],
		] as [CurrencyCode, number, string][])(
			"in %s accepts %i and refuses one more",
			(currency, largest, message) => {
				expect(createErrors({ currency, amountMinor: largest })).toEqual({});
				expect(createErrors({ currency, amountMinor: largest + 1 })).toEqual(
					{
						amountMinor: message,
					},
				);
			},
		);

		test("accepts one minor unit", () => {
			expect(createErrors({ amountMinor: 1 })).toEqual({});
		});

		test("refuses an unknown or missing currency", () => {
			expect(createErrors({ currency: "AUD" })).toEqual({
				currency: "Use a supported currency.",
			});
			expect(createErrors({ currency: undefined })).toEqual({
				currency: "Use a supported currency.",
			});
		});
	});

	describe("text (BR-F03-12, root 6.7)", () => {
		test("payee: 80 characters pass and 81 are refused", () => {
			expect(createErrors({ payee: "a".repeat(80) })).toEqual({});
			expect(createErrors({ payee: "👍".repeat(81) })).toEqual({
				payee: "Use 80 characters or fewer.",
			});
		});

		test("description: 120 characters pass and 121 are refused", () => {
			expect(createErrors({ description: "a".repeat(120) })).toEqual({});
			expect(createErrors({ description: "a".repeat(121) })).toEqual({
				description: "Use 120 characters or fewer.",
			});
		});

		test("note: 500 characters pass and 501 are refused", () => {
			expect(createErrors({ note: "a".repeat(500) })).toEqual({});
			expect(createErrors({ note: "a".repeat(501) })).toEqual({
				note: "Use 500 characters or fewer.",
			});
		});

		test("control characters are refused in every text field", () => {
			expect(createErrors({ payee: "Swi\tggy" })).toEqual({
				payee: "Remove unsupported characters.",
			});
			expect(createErrors({ description: "a\nb" })).toEqual({
				description: "Remove unsupported characters.",
			});
			expect(createErrors({ note: "a\u0000b" })).toEqual({
				note: "Remove unsupported characters.",
			});
		});
	});

	describe("dates and times", () => {
		test("occurredAt is a UTC instant in whole minutes", () => {
			expect(createErrors({ occurredAt: "2026-10-19T16:45:00.000Z" })).toEqual(
				{},
			);
			expect(createErrors({ occurredAt: "2026-10-19T16:45:30Z" })).toEqual({
				occurredAt: "Use a time in whole minutes.",
			});
			expect(createErrors({ occurredAt: "2026-10-19T16:45:00.500Z" })).toEqual(
				{
					occurredAt: "Use a time in whole minutes.",
				},
			);
		});

		test.each([
			"2026-10-19T22:15:00+05:30",
			"2026-10-19 16:45:00Z",
			"2026-10-19",
			"2026-02-30T10:00:00Z",
			"yesterday",
		])("refuses occurredAt %j", (occurredAt) => {
			expect(createErrors({ occurredAt })).toEqual({
				occurredAt: "Use an ISO date and time in UTC.",
			});
		});

		test("occurredOn is a real date", () => {
			expect(createErrors({ occurredOn: "2026-10-32" })).toEqual({
				occurredOn: "Use a date as YYYY-MM-DD.",
			});
		});

		// AC-F03-07, at the schema level. Row 26: 2026-10-31T19:00:00Z.
		test("occurredOn must be a date occurredAt has at some real UTC offset (BR-F03-10)", () => {
			const at = "2026-10-31T19:00:00Z";
			expect(
				createErrors({ occurredAt: at, occurredOn: "2026-10-31" }),
			).toEqual({});
			expect(
				createErrors({ occurredAt: at, occurredOn: "2026-11-01" }),
			).toEqual({});
			expect(
				createErrors({ occurredAt: at, occurredOn: "2026-11-02" }),
			).toEqual({
				occurredOn: "The date doesn't match the time.",
			});
			expect(
				createErrors({ occurredAt: at, occurredOn: "2026-10-30" }),
			).toEqual({
				occurredOn: "The date doesn't match the time.",
			});
		});

		test("createdAt is any UTC instant", () => {
			expect(createErrors({ createdAt: "2026-10-19T16:46:12.345Z" })).toEqual(
				{},
			);
			expect(createErrors({ createdAt: "soon" })).toEqual({
				createdAt: "Use an ISO date and time in UTC.",
			});
		});
	});

	describe("fields a client never sends (BR-F03-19)", () => {
		// AC-F03-12, at the schema level.
		test.each([
			["source", "manual"],
			["demo", false],
			["edited", false],
			["subscriptionId", GOLDEN_GOALS.vacation.id],
			["dueOn", "2026-10-05"],
			["version", 1],
			["updatedAt", "2026-10-19T16:46:12Z"],
		])("refuses %s by name", (field, value) => {
			expect(createErrors({ [field]: value })).toEqual({
				[field]: "Daybook sets this field.",
			});
		});

		test("refuses a key it does not know", () => {
			expect(createErrors({ colour: "red" })).toEqual({
				_body: 'Unrecognized key: "colour"',
			});
		});

		test("refuses an id that is not a UUIDv7", () => {
			expect(
				createErrors({ id: "0192f0c4-8a1b-4c2d-9e3f-0123456789ab" }),
			).toEqual({
				id: "Use a UUIDv7 id.",
			});
		});
	});
});

describe("the edit body (BR-F03-23)", () => {
	test("accepts one changed field", () => {
		expect(transactionEditSchema.parse({ description: "Dinner" })).toEqual({
			description: "Dinner",
		});
		expect(transactionEditSchema.parse({ type: "refund" })).toEqual({
			type: "refund",
		});
	});

	test("clears an optional text with null or blank", () => {
		expect(
			transactionEditSchema.parse({ description: null, note: "  " }),
		).toEqual({
			description: null,
			note: null,
		});
	});

	test("passes an empty payee on as null, for the merged row's rules to refuse", () => {
		expect(transactionEditSchema.parse({ payee: "" })).toEqual({ payee: null });
	});

	// D-486: a client may send the whole form; a stored null is no change, and the merged
	// row's type rules judge any null that is a change.
	test("passes a null category or goalId on, for the merged row's rules to judge", () => {
		expect(transactionEditSchema.parse({ goalId: null })).toEqual({
			goalId: null,
		});
		expect(transactionEditSchema.parse({ category: null })).toEqual({
			category: null,
		});
		expect(
			transactionEditSchema.parse({
				type: "expense",
				category: "food",
				goalId: null,
				payee: "Swiggy",
			}),
		).toEqual({
			type: "expense",
			category: "food",
			goalId: null,
			payee: "Swiggy",
		});
	});

	// B3, Q3, D-498: text rules reach the edit's text fields as they do the create's.
	test("refuses a lone surrogate in the payee and a line separator in the description", () => {
		expect(editErrors({ payee: "Sw\ud800" })).toEqual({
			payee: "Remove unsupported characters.",
		});
		expect(editErrors({ description: "Dinner\u2028out" })).toEqual({
			description: "Remove unsupported characters.",
		});
	});

	test("clears a description or note of zero-width spaces, as a blank one", () => {
		expect(
			transactionEditSchema.parse({ description: "\u200b", note: "\u200b\n" }),
		).toEqual({ description: null, note: null });
	});

	test("refuses a note with a lone surrogate but keeps a line separator inside it", () => {
		expect(editErrors({ note: "a\ud83d" })).toEqual({
			note: "Remove unsupported characters.",
		});
		expect(transactionEditSchema.parse({ note: "a\u2028b" })).toEqual({
			note: "a\u2028b",
		});
	});

	test("refuses a body with no change", () => {
		expect(editErrors({})).toEqual({ _body: "Send at least one change." });
	});

	test("sends the date and time together or neither", () => {
		expect(editErrors({ occurredAt: "2026-10-19T16:45:00Z" })).toEqual({
			occurredOn: "Send the date and time together.",
		});
		expect(editErrors({ occurredOn: "2026-10-19" })).toEqual({
			occurredAt: "Send the date and time together.",
		});
		expect(
			editErrors({
				occurredAt: "2026-10-19T16:45:00Z",
				occurredOn: "2026-10-19",
			}),
		).toEqual({});
	});

	test("checks that a new date fits the new time", () => {
		expect(
			editErrors({
				occurredAt: "2026-10-31T19:00:00Z",
				occurredOn: "2026-11-02",
			}),
		).toEqual({
			occurredOn: "The date doesn't match the time.",
		});
	});

	test("sends the currency whenever it sends an amount (BR-F03-05)", () => {
		expect(editErrors({ amountMinor: 31000 })).toEqual({
			currency: "Send the currency with the amount.",
		});
		expect(editErrors({ amountMinor: 31000, currency: "INR" })).toEqual({});
	});

	test("checks the amount against the currency's largest", () => {
		expect(editErrors({ amountMinor: 1000000000, currency: "JPY" })).toEqual({
			amountMinor: "The largest amount is 999,999,999.",
		});
	});

	// AC-F03-06: a PATCH that carries createdAt is refused.
	test("refuses createdAt, so the entry window's anchor cannot move", () => {
		expect(editErrors({ createdAt: "2026-10-19T16:46:12Z" })).toEqual({
			createdAt: "The recording time can't change.",
		});
	});

	test("refuses the id and every system field", () => {
		expect(editErrors({ id: ID, note: "x" })).toEqual({
			id: "Daybook sets this field.",
		});
		expect(editErrors({ source: "manual", note: "x" })).toEqual({
			source: "Daybook sets this field.",
		});
		expect(editErrors({ edited: true, note: "x" })).toEqual({
			edited: "Daybook sets this field.",
		});
	});

	test("applies the field rules of a create", () => {
		expect(editErrors({ category: "pizza" })).toEqual({
			category: "Choose a category.",
		});
		expect(editErrors({ goalId: "vacation" })).toEqual({
			goalId: "Choose a Goal.",
		});
		expect(editErrors({ payee: "a".repeat(81) })).toEqual({
			payee: "Use 80 characters or fewer.",
		});
		expect(editErrors({ amountMinor: 0, currency: "INR" })).toEqual({
			amountMinor: "Enter an amount above zero.",
		});
	});
});

// golden #12: the Sunrise Apartments charge for 1 October.
const HINT = {
	subscriptionId: GOLDEN_SUBSCRIPTIONS.sunrise.id,
	dueOn: "2026-10-01",
};
const deleteErrors = (body: unknown) => messages(transactionDeleteSchema, body);

describe("the delete body (BR-F03-17, BR-F03-19; D-487)", () => {
	test("accepts an empty body", () => {
		expect(transactionDeleteSchema.parse({})).toEqual({});
	});

	test("accepts a charge's whole hint, with the id lowercased", () => {
		expect(
			transactionDeleteSchema.parse({
				...HINT,
				subscriptionId: HINT.subscriptionId.toUpperCase(),
			}),
		).toEqual(HINT);
	});

	test("refuses half a hint on the missing field", () => {
		expect(deleteErrors({ subscriptionId: HINT.subscriptionId })).toEqual({
			dueOn: "Send the Subscription and due date together.",
		});
		expect(deleteErrors({ dueOn: HINT.dueOn })).toEqual({
			subscriptionId: "Send the Subscription and due date together.",
		});
	});

	test("refuses a hint that is not an id and a date, without a half-hint message", () => {
		expect(deleteErrors({ subscriptionId: "sunrise", dueOn: "1 Oct" })).toEqual({
			subscriptionId: "Use a UUIDv7 id.",
			dueOn: "Use a date as YYYY-MM-DD.",
		});
		expect(deleteErrors({ ...HINT, dueOn: "2026-02-30" })).toEqual({
			dueOn: "Use a date as YYYY-MM-DD.",
		});
	});

	test("refuses null in place of a hint", () => {
		expect(deleteErrors({ subscriptionId: null, dueOn: null })).toEqual({
			subscriptionId: "Use a UUIDv7 id.",
			dueOn: "Use a date as YYYY-MM-DD.",
		});
	});

	test("refuses any other field", () => {
		expect(Object.keys(deleteErrors({ ...HINT, version: 1 }))).toEqual([
			"_body",
		]);
		expect(Object.keys(deleteErrors({ note: "x" }))).toEqual(["_body"]);
	});
});

describe("typeRuleIssues, for the merged row of an edit", () => {
	const merged = (changes: Record<string, unknown>) => ({
		type: "expense" as TxnType,
		category: "food",
		goalId: null,
		payee: "Swiggy",
		description: null,
		...changes,
	});

	// AC-F03-09: a PATCH from expense to refund keeps the category.
	test("an expense changed to a refund keeps its category", () => {
		expect(typeRuleIssues(merged({ type: "refund" }))).toEqual([]);
	});

	test("an expense changed to income needs an income category", () => {
		expect(typeRuleIssues(merged({ type: "income" }))).toEqual([
			{ path: "category", message: "Choose a category." },
		]);
		expect(
			typeRuleIssues(merged({ type: "income", category: "salary" })),
		).toEqual([]);
	});

	test("reports every broken rule, each with its field", () => {
		expect(
			typeRuleIssues({
				type: "goal_withdrawal",
				category: "food",
				goalId: null,
				payee: "Swiggy",
				description: "x",
			}),
		).toEqual([
			{ path: "goalId", message: "Choose a Goal." },
			{ path: "category", message: "Goal Transactions have no category." },
			{ path: "payee", message: "Goal Transactions have no payee." },
			{
				path: "description",
				message: "Goal Transactions have no description.",
			},
		]);
	});

	test("the golden rows break no rule", () => {
		for (const row of GOLDEN_ALL) expect(typeRuleIssues(row)).toEqual([]);
	});
});

// BR-F03-02, D-222
describe("typeChangeAllowed", () => {
	const PERSONAL = ["income", "expense", "refund"];
	test.each(
		TXN_TYPES.flatMap((from) => TXN_TYPES.map((to) => [from, to] as const)),
	)("%s to %s", (from, to) => {
		const sameGroup = PERSONAL.includes(from) === PERSONAL.includes(to);
		expect(typeChangeAllowed(from, to)).toBe(sameGroup);
	});

	test("expense to goal_contribution is refused (AC-F03-09)", () => {
		expect(typeChangeAllowed("expense", "goal_contribution")).toBe(false);
	});
});

describe("occurredOnFits (BR-F03-10, D-220)", () => {
	test.each([
		["2026-10-31T19:00:00Z", "2026-10-31", true],
		["2026-10-31T19:00:00Z", "2026-11-01", true],
		["2026-10-31T19:00:00Z", "2026-11-02", false],
		["2026-10-31T19:00:00Z", "2026-10-30", false],
		// UTC−12:00 at the last minute of a day, and UTC+14:00 at its first minute.
		["2026-11-01T11:59:00Z", "2026-10-31", true],
		["2026-11-01T12:00:00Z", "2026-10-31", false],
		["2026-11-01T10:00:00Z", "2026-11-02", true],
		["2026-11-01T09:59:00Z", "2026-11-02", false],
	])("%s on %s fits: %s", (occurredAt, occurredOn, fits) => {
		expect(occurredOnFits(occurredAt, occurredOn)).toBe(fits);
	});

	test("every golden row fits, the ⚑ rows included", () => {
		for (const row of GOLDEN_ALL)
			expect(occurredOnFits(row.occurredAt, row.occurredOn)).toBe(true);
	});
});

test("a golden row is a Transaction in the API's shape", () => {
	const transaction: Transaction = goldenRow(16);
	expect(transaction.subscriptionId).not.toBeNull();
});
