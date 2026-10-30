import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { transactionEditSchema } from "@/lib/transactions/schemas";
import { ApiError } from "../../../api/errors";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import type { Profile } from "../../context";
import type { Tx } from "../../with-user";
import { editTransaction } from "../edit";
import { getTransaction } from "../get";
import {
	addExpense,
	afterFirstStatement,
	asUser,
	goldenContext,
	uuidV7At,
} from "./helpers";

/** `editTransaction` (F03 section 11, BR-F03-09, BR-F03-11, BR-F03-16, BR-F03-18, BR-F03-23;
 * D-486) through the runtime role and RLS. Every case rolls back, at its own request clock. */

let owner: Client;
let golden: LoadedGolden;
let other: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "edit"));
	other = await loadGolden(owner, await createUser(owner, "edit-other"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

// The golden clock: 2026-11-02T12:00 IST.
const NOW = GOLDEN_NOW;

type Options = { now?: string; version?: number; profile?: Partial<Profile> };

/** Runs `fn` as the golden user, then edits `id` with `fields`, parsed by the edit schema, at
 * the request clock `now` and `If-Match` `version`. */
function edit(
	id: string | ((tx: Tx) => Promise<string>),
	fields: Record<string, unknown>,
	{ now = NOW, version = 1, profile = {} }: Options = {},
) {
	const ctx = { ...goldenContext(golden.userId, profile), now: new Date(now) };
	const body = transactionEditSchema.parse(fields);
	return asUser(golden.userId, async (tx) => {
		const target = typeof id === "string" ? id : await id(tx);
		return editTransaction(tx, ctx, target, version, body);
	});
}

/** The ApiError an edit throws, as code, fields and details. */
async function refusal(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return { code: error.code, fields: error.fields, details: error.details };
	}
	throw new Error("The edit was not refused.");
}

const invalid = (fields: Record<string, string>) => ({
	code: "validation_failed",
	fields,
	details: {},
});

/** Adds an expense for the golden user inside the edit's transaction. */
const row =
	(fields: Partial<Parameters<typeof addExpense>[2]> = {}) =>
	(tx: Tx) =>
		addExpense(tx, golden.userId, {
			payee: "Chai Point",
			amountMinor: 30000,
			occurredOn: "2026-11-02",
			...fields,
		});

describe("an edit", () => {
	// golden #24: Swiggy, 640.00 of food on 19 October.
	test("changes only the sent fields, raises version by 1 and sets updatedAt to the clock", async () => {
		const { result, statements } = await edit(golden.id(24), {
			amountMinor: 65000,
			currency: "INR",
			payee: "Swiggy Instamart",
		});
		expect(result).toEqual({
			id: golden.id(24),
			type: "expense",
			amountMinor: 65000,
			occurredAt: "2026-10-19T16:45:00.000Z",
			occurredOn: "2026-10-19",
			category: "food",
			goalId: null,
			payee: "Swiggy Instamart",
			description: null,
			note: null,
			source: "manual",
			demo: false,
			subscriptionId: null,
			dueOn: null,
			edited: false,
			version: 2,
			createdAt: "2026-10-19T16:45:00.000Z",
			updatedAt: NOW,
			currency: "INR",
		});
		// The read, the profile lock, the update.
		expect(statements).toBe(3);
	});

	// D-493: the answer carries the currency read under the lock, not the request's earlier read.
	test("answers the currency it locked, even when the request read another", async () => {
		const { result } = await edit(
			golden.id(24),
			{ note: "Locked" },
			{ profile: { currency: "USD" } },
		);
		expect(result.currency).toBe("INR");
	});

	// D-486: a client may send the whole form, nulls included.
	test("accepts the whole form, with the stored null goalId and the stored values", async () => {
		const { result } = await edit(golden.id(24), {
			type: "expense",
			amountMinor: 64000,
			currency: "INR",
			occurredAt: "2026-10-19T16:45:00Z",
			occurredOn: "2026-10-19",
			category: "food",
			goalId: null,
			payee: "Swiggy",
			description: null,
			note: "Dinner",
		});
		expect(result).toMatchObject({ goalId: null, note: "Dinner", version: 2 });
	});

	// golden #8: BigBasket, "Monthly groceries". BR-F03-12: null and blank clear a text.
	test("clears the description with null and sets a note", async () => {
		const { result, statements } = await edit(golden.id(8), {
			description: null,
			note: "Bought \r\nfor two weeks ",
		});
		expect(result).toMatchObject({
			payee: "BigBasket",
			description: null,
			note: "Bought \nfor two weeks",
			version: 2,
		});
		// Without a currency the profile is still locked: the read, the lock, the update.
		expect(statements).toBe(3);
	});

	test("a second edit at the new version raises it again", async () => {
		const ctx = goldenContext(golden.userId);
		const { result } = await asUser(golden.userId, async (tx) => {
			await editTransaction(tx, ctx, golden.id(24), 1, { payee: "One" });
			return editTransaction(tx, ctx, golden.id(24), 2, { payee: "Two" });
		});
		expect(result).toMatchObject({ payee: "Two", version: 3 });
	});

	test("resending every stored value is still an edit", async () => {
		const { result } = await edit(golden.id(24), {
			type: "expense",
			amountMinor: 64000,
			currency: "INR",
			occurredAt: "2026-10-19T16:45:00Z",
			occurredOn: "2026-10-19",
			category: "food",
			payee: "Swiggy",
		});
		expect(result).toMatchObject({ amountMinor: 64000, version: 2 });
	});
});

describe("the type (AC-F03-09, BR-F03-02)", () => {
	test("expense to goal_contribution is refused on type", async () => {
		expect(
			await refusal(edit(golden.id(24), { type: "goal_contribution" })),
		).toEqual(
			invalid({
				type: "Delete this Transaction and add a new one to change to this type.",
			}),
		);
	});

	test("expense to refund keeps the category", async () => {
		const { result } = await edit(golden.id(24), { type: "refund" });
		expect(result).toMatchObject({ type: "refund", category: "food" });
	});

	// golden #13: Acme Corp, salary.
	test("income to expense without a category is refused on category", async () => {
		expect(await refusal(edit(golden.id(13), { type: "expense" }))).toEqual(
			invalid({ category: "Choose a category." }),
		);
	});

	test("income to expense with an expense category passes", async () => {
		const { result } = await edit(golden.id(13), {
			type: "expense",
			category: "housing",
		});
		expect(result).toMatchObject({ type: "expense", category: "housing" });
	});

	test("a category of the other kind is refused on the merged row", async () => {
		expect(await refusal(edit(golden.id(24), { category: "salary" }))).toEqual(
			invalid({ category: "Choose a category." }),
		);
	});

	test("a null category on an expense is refused on the merged row", async () => {
		expect(await refusal(edit(golden.id(24), { category: null }))).toEqual(
			invalid({ category: "Choose a category." }),
		);
	});

	test("a null payee on an expense is refused on the merged row", async () => {
		expect(await refusal(edit(golden.id(24), { payee: null }))).toEqual(
			invalid({ payee: "Enter who you paid, or who paid you." }),
		);
	});

	test("a refused type leaves the row judged as its stored type", async () => {
		const goalId = "0199a000-0000-7000-8001-000000000001";
		expect(
			await refusal(edit(golden.id(24), { type: "goal_withdrawal", goalId })),
		).toEqual(
			invalid({
				type: "Delete this Transaction and add a new one to change to this type.",
				goalId: "Only Goal Transactions have a Goal.",
			}),
		);
	});
});

describe("charges and demo rows (BR-F03-11, BR-F03-16, BR-F03-18; D-486)", () => {
	// golden #12: the Sunrise Apartments charge, 18,000.00 on 1 October at 00:00 IST.
	test("a charge takes a new amount, category, payee, description and note", async () => {
		const { result } = await edit(golden.id(12), {
			amountMinor: 1850000,
			currency: "INR",
			category: "utilities",
			payee: "Sunrise Apts",
			description: "Rent and maintenance",
			note: "Raised in October",
		});
		expect(result).toMatchObject({
			type: "expense",
			amountMinor: 1850000,
			category: "utilities",
			payee: "Sunrise Apts",
			description: "Rent and maintenance",
			note: "Raised in October",
			occurredOn: "2026-10-01",
			source: "subscription",
			version: 2,
		});
	});

	test.each([["income"], ["refund"], ["goal_contribution"]])(
		"a charge's type to %s is refused as a charge's",
		async (type) => {
			expect(await refusal(edit(golden.id(12), { type }))).toEqual(
				invalid({ type: "A charge's type can't change." }),
			);
		},
	);

	test("a charge's new date and time are refused on both", async () => {
		expect(
			await refusal(
				edit(golden.id(12), {
					occurredAt: "2026-10-01T18:30:00Z",
					occurredOn: "2026-10-02",
				}),
			),
		).toEqual(
			invalid({
				occurredAt: "This Transaction's date and time can't change.",
				occurredOn: "This Transaction's date and time can't change.",
			}),
		);
	});

	test("a charge's new time on the same date is refused on occurredAt only", async () => {
		expect(
			await refusal(
				edit(golden.id(12), {
					occurredAt: "2026-09-30T20:00:00Z",
					occurredOn: "2026-10-01",
				}),
			),
		).toEqual(
			invalid({
				occurredAt: "This Transaction's date and time can't change.",
			}),
		);
	});

	test("a charge's new date at the same time is refused on occurredOn only", async () => {
		// 18:30 UTC on 30 September is 30 September from UTC−12:00 to UTC+05:29.
		expect(
			await refusal(
				edit(golden.id(12), {
					occurredAt: "2026-09-30T18:30:00Z",
					occurredOn: "2026-09-30",
				}),
			),
		).toEqual(
			invalid({
				occurredOn: "This Transaction's date and time can't change.",
			}),
		);
	});

	test("a charge's own type, date and time, sent again, pass", async () => {
		const { result } = await edit(golden.id(12), {
			type: "expense",
			occurredAt: "2026-09-30T18:30:00Z",
			occurredOn: "2026-10-01",
			payee: "Sunrise Apts",
		});
		expect(result).toMatchObject({
			occurredAt: "2026-09-30T18:30:00.000Z",
			payee: "Sunrise Apts",
		});
	});

	test("a demo row refuses a new date and time, and stays demo after a type change", async () => {
		const demo = row({ demo: true });
		expect(
			await refusal(
				edit(demo, {
					occurredAt: "2026-11-01T06:30:00Z",
					occurredOn: "2026-11-01",
				}),
			),
		).toEqual(
			invalid({
				occurredAt: "This Transaction's date and time can't change.",
				occurredOn: "This Transaction's date and time can't change.",
			}),
		);
		const { result } = await edit(demo, { type: "refund" });
		expect(result).toMatchObject({ type: "refund", demo: true });
	});
});

describe("the entry window on an edit (AC-F03-06, TIME-7, BR-F03-11)", () => {
	// Recorded on 2026-10-16 at 12:00 IST; its window is 6 to 16 October.
	const recorded = row({
		createdAt: "2026-10-16T06:30:00.000Z",
		occurredOn: "2026-10-16",
	});
	// Two months later.
	const later = { now: "2026-12-16T06:30:00.000Z" };
	const on = (occurredOn: string) => ({
		occurredAt: `${occurredOn}T06:30:00Z`,
		occurredOn,
	});

	test("two months later, 2026-10-06 passes", async () => {
		const { result } = await edit(recorded, on("2026-10-06"), later);
		expect(result).toMatchObject({ occurredOn: "2026-10-06" });
	});

	// D-499: the window is the row's own, not today's, so the message does not say "today"; the
	// client writes its dated message from `details`.
	test("two months later, 2026-10-17 and 2026-10-05 get date_out_of_window with the window", async () => {
		for (const day of ["2026-10-17", "2026-10-05"]) {
			expect(await refusal(edit(recorded, on(day), later))).toEqual({
				code: "date_out_of_window",
				fields: {
					occurredOn: "Choose a date in this Transaction's entry window.",
				},
				details: { firstOn: "2026-10-06", lastOn: "2026-10-16" },
			});
		}
	});

	// Recorded at 20:00 UTC on 16 October: 17 October in India, 16 October in Los Angeles.
	const lateEvening = row({
		createdAt: "2026-10-16T20:00:00.000Z",
		occurredAt: "2026-10-16T20:00:00Z",
		occurredOn: "2026-10-17",
	});
	const losAngeles = { ...later, profile: { timezone: "America/Los_Angeles" } };

	test("reads the recording date in the current profile zone", async () => {
		// India: 7 to 17 October. Los Angeles: 6 to 16 October.
		expect(
			await refusal(edit(lateEvening, on("2026-10-06"), later)),
		).toMatchObject({
			code: "date_out_of_window",
			details: { firstOn: "2026-10-07", lastOn: "2026-10-17" },
		});
		const { result } = await edit(lateEvening, on("2026-10-06"), losAngeles);
		expect(result).toMatchObject({ occurredOn: "2026-10-06" });
	});

	test("a new time on the stored date skips the window, even one the zone change left it outside", async () => {
		// 17 October is outside Los Angeles's window, but the date is not changing.
		const { result } = await edit(
			lateEvening,
			{ occurredAt: "2026-10-17T04:00:00Z", occurredOn: "2026-10-17" },
			losAngeles,
		);
		expect(result).toMatchObject({
			occurredAt: "2026-10-17T04:00:00.000Z",
			occurredOn: "2026-10-17",
		});
	});
});

describe("future times on an edit (BR-F03-09)", () => {
	// Recorded at 11:30 IST; the request clock is 12:00 IST.
	const recorded = row({
		createdAt: "2026-11-02T06:00:00.000Z",
		occurredAt: "2026-11-02T06:00:00Z",
	});
	const at = (time: string) => ({
		occurredAt: `2026-11-02T${time}:00Z`,
		occurredOn: "2026-11-02",
	});

	test("occurredAt may run 5 minutes past the request clock, not past createdAt", async () => {
		const { result } = await edit(recorded, at("06:35"));
		expect(result).toMatchObject({ occurredAt: "2026-11-02T06:35:00.000Z" });
	});

	test("occurredAt 6 minutes past the request clock gets validation_failed on occurredAt", async () => {
		expect(await refusal(edit(recorded, at("06:36")))).toEqual(
			invalid({ occurredAt: "The time can't be in the future." }),
		);
	});

	test("a stored time ahead of the clock, sent again, passes", async () => {
		// Recorded by a device clock 5 minutes ahead, then edited at once.
		const ahead = row({
			createdAt: "2026-11-02T06:35:00.000Z",
			occurredAt: "2026-11-02T06:40:00Z",
		});
		const { result } = await edit(ahead, { ...at("06:40"), payee: "Tea" });
		expect(result).toMatchObject({
			occurredAt: "2026-11-02T06:40:00.000Z",
			payee: "Tea",
		});
	});
});

describe("the currency (BR-F03-05, AC-F03-13)", () => {
	test("an amount in USD for an INR profile gets currency_mismatch", async () => {
		expect(
			await refusal(
				edit(golden.id(24), { amountMinor: 100, currency: "USD" }),
			),
		).toMatchObject({ code: "currency_mismatch" });
	});

	test("a currency sent alone is checked too", async () => {
		expect(
			await refusal(edit(golden.id(24), { currency: "USD" })),
		).toMatchObject({ code: "currency_mismatch" });
		const { result } = await edit(golden.id(24), { currency: "INR" });
		expect(result).toMatchObject({ amountMinor: 64000, version: 2 });
	});
});

describe("the check order (F03 section 11)", () => {
	test("the type rules come before the currency", async () => {
		expect(
			(
				await refusal(
					edit(golden.id(24), {
						type: "goal_contribution",
						amountMinor: 100,
						currency: "USD",
					}),
				)
			).code,
		).toBe("validation_failed");
	});

	test("the currency comes before the dates", async () => {
		expect(
			(
				await refusal(
					edit(golden.id(24), {
						amountMinor: 100,
						currency: "USD",
						occurredAt: "2026-11-02T06:00:00Z",
						occurredOn: "2026-11-02",
					}),
				)
			).code,
		).toBe("currency_mismatch");
	});

	test("a future time comes before the window", async () => {
		// golden #24's window is 9 to 19 October; 2 November is outside it and in the future.
		expect(
			await refusal(
				edit(golden.id(24), {
					occurredAt: "2026-11-02T07:00:00Z",
					occurredOn: "2026-11-02",
				}),
			),
		).toEqual(invalid({ occurredAt: "The time can't be in the future." }));
	});
});

describe("versions and missing rows (BR-P2-21, D-485)", () => {
	test("a stale version gets 409 with the current row and currency", async () => {
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, async (tx) => {
			const current = await getTransaction(tx, golden.id(24));
			const answer = await refusal(
				editTransaction(tx, ctx, golden.id(24), 2, { payee: "Mine" }),
			);
			return { current, answer };
		});
		expect(result.answer).toEqual({
			code: "version_conflict",
			fields: {},
			details: { current: { ...result.current, currency: "INR" } },
		});
		// The test's read; then the edit's read, lock, update that matched nothing and re-read.
		expect(statements).toBe(5);
	});

	// D-493
	test("a 409 carries the currency it locked, even when the request read another", async () => {
		const ctx = goldenContext(golden.userId, { currency: "USD" });
		const { result } = await asUser(golden.userId, (tx) =>
			refusal(editTransaction(tx, ctx, golden.id(24), 2, { payee: "Mine" })),
		);
		expect(result).toMatchObject({
			code: "version_conflict",
			details: { current: { id: golden.id(24), currency: "INR" } },
		});
	});

	test("another user's row, an unknown id and a non-UUID get 404", async () => {
		for (const id of [other.id(24), uuidV7At(NOW), "24"]) {
			expect(await refusal(edit(id, { payee: "Mine" }))).toMatchObject({
				code: "not_found",
			});
		}
	});

	/** A committed row of the golden user's, changed by `between` once the edit has read it. */
	async function race(between: (id: string) => Promise<unknown>) {
		const id = uuidV7At(NOW);
		await owner.query(
			`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			   occurred_at, occurred_on, category, payee, source, version)
			 VALUES ($1, $2, $3, $3, 'expense', 30000, $3, '2026-11-02', 'food', 'Chai Point', 'manual', 1)`,
			[id, golden.userId, NOW],
		);
		const ctx = goldenContext(golden.userId);
		const { result, statements } = await asUser(golden.userId, (tx) =>
			refusal(
				editTransaction(
					afterFirstStatement(tx, () => between(id)),
					ctx,
					id,
					1,
					{
						payee: "Mine",
					},
				),
			),
		);
		return { id, refusal: result, statements };
	}

	test("a row changed after the read gets 409 with the other device's row", async () => {
		const {
			id,
			refusal: answer,
			statements,
		} = await race((id) =>
			owner.query(
				`UPDATE app.transactions SET payee = 'Theirs', version = 2 WHERE id = $1`,
				[id],
			),
		);
		expect(answer).toMatchObject({
			code: "version_conflict",
			details: {
				current: { id, payee: "Theirs", version: 2, currency: "INR" },
			},
		});
		// The read, the lock, the update that matched nothing, the re-read.
		expect(statements).toBe(4);
	});

	test("a row deleted after the read gets 404", async () => {
		const { refusal: answer } = await race((id) =>
			owner.query(`DELETE FROM app.transactions WHERE id = $1`, [id]),
		);
		expect(answer).toMatchObject({ code: "not_found" });
	});
});

// T2: edits at the edges of what a client may send.
describe("the same instant written two ways, with a new date", () => {
	// Recorded 2026-10-20 12:00 IST, so its window is 10 to 20 October; its time is 19 October
	// 16:45Z, which is 20 October 22:15 in India. The date can be the 19th or the 20th.
	const recorded = row({
		createdAt: "2026-10-20T06:30:00.000Z",
		occurredAt: "2026-10-19T16:45:00Z",
		occurredOn: "2026-10-19",
	});
	// The request clock is before that time, so a time that changed would be "in the future".
	const early = { now: "2026-10-19T00:00:00.000Z" };

	test.each([
		["no fraction", "2026-10-19T16:45:00Z"],
		["three fraction digits", "2026-10-19T16:45:00.000Z"],
		["one fraction digit", "2026-10-19T16:45:00.0Z"],
	])(
		"%s: the time is no change, so only the date is checked",
		async (_name, occurredAt) => {
			const { result } = await edit(
				recorded,
				{ occurredAt, occurredOn: "2026-10-20" },
				early,
			);
			expect(result).toMatchObject({
				occurredAt: "2026-10-19T16:45:00.000Z",
				occurredOn: "2026-10-20",
				version: 2,
			});
		},
	);

	test("a time one minute later is a change, and in the future it is refused", async () => {
		expect(
			await refusal(
				edit(
					recorded,
					{ occurredAt: "2026-10-19T16:46:00Z", occurredOn: "2026-10-20" },
					early,
				),
			),
		).toEqual(invalid({ occurredAt: "The time can't be in the future." }));
	});

	test("the same instant with a date outside the window is refused with the window", async () => {
		// The date must fit the time, so the 19th and the 20th are all there is; move the row's
		// recording date back so the 20th is outside.
		const older = row({
			createdAt: "2026-10-19T06:30:00.000Z",
			occurredAt: "2026-10-19T16:45:00Z",
			occurredOn: "2026-10-19",
		});
		expect(
			await refusal(
				edit(
					older,
					{ occurredAt: "2026-10-19T16:45:00Z", occurredOn: "2026-10-20" },
					early,
				),
			),
		).toEqual({
			code: "date_out_of_window",
			fields: {
				occurredOn: "Choose a date in this Transaction's entry window.",
			},
			details: { firstOn: "2026-10-09", lastOn: "2026-10-19" },
		});
	});
});

describe("a demo row's type (BR-F03-02, BR-F03-18, D-486)", () => {
	const demo = row({ demo: true });

	test.each([
		[
			"goal_contribution",
			{
				goalId: "0199a000-0000-7000-8001-000000000001",
				category: null,
				payee: null,
			},
		],
		["goal_withdrawal", {}],
	])("cannot become %s, across the groups", async (type, extra) => {
		const answer = await refusal(edit(demo, { type, ...extra }));
		expect(answer.code).toBe("validation_failed");
		expect(answer.fields["type"]).toBe(
			"Delete this Transaction and add a new one to change to this type.",
		);
	});

	test.each(["income", "refund"] as const)(
		"can become %s inside its group, and stays demo",
		async (type) => {
			const { result } = await edit(demo, {
				type,
				category: type === "income" ? "freelance" : "food",
			});
			expect(result).toMatchObject({ type, demo: true });
		},
	);

	test("an income demo row becomes an expense with a category of its new kind", async () => {
		const income = row({ demo: true, type: "income", category: "salary" });
		const { result } = await edit(income, {
			type: "expense",
			category: "housing",
		});
		expect(result).toMatchObject({
			type: "expense",
			category: "housing",
			demo: true,
		});
	});
});

describe("a charge with a cross-group type and a new date (BR-F03-11, BR-F03-16; D-486)", () => {
	// golden #12, the Sunrise Apartments charge, 1 October at 00:00 IST.
	test("every refusal is reported at once: the type, and the date and the time", async () => {
		expect(
			await refusal(
				edit(golden.id(12), {
					type: "goal_contribution",
					occurredAt: "2026-10-02T06:30:00Z",
					occurredOn: "2026-10-02",
				}),
			),
		).toEqual(
			invalid({
				type: "A charge's type can't change.",
				occurredAt: "This Transaction's date and time can't change.",
				occurredOn: "This Transaction's date and time can't change.",
			}),
		);
	});

	test("a charge's own type sent again, with its own date and time, is no change", async () => {
		const { result } = await edit(golden.id(12), {
			type: "expense",
			occurredAt: "2026-09-30T18:30:00Z",
			occurredOn: "2026-10-01",
			note: "Same",
		});
		expect(result).toMatchObject({
			type: "expense",
			occurredOn: "2026-10-01",
			note: "Same",
		});
	});

	test("a charge's type is refused even within its group", async () => {
		expect(await refusal(edit(golden.id(12), { type: "refund" }))).toEqual(
			invalid({ type: "A charge's type can't change." }),
		);
	});
});

describe("a currency sent alone (BR-F03-05, D-486)", () => {
	test("changes nothing but the version and the clock, once the profile lock matches", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			const before = await getTransaction(tx, golden.id(24));
			const ctx = goldenContext(golden.userId);
			const after = await editTransaction(tx, ctx, golden.id(24), 1, {
				currency: "INR",
			});
			return { before, after };
		});
		const { currency, ...row } = result.after;
		expect(currency).toBe("INR");
		expect(row).toEqual({ ...result.before, version: 2, updatedAt: NOW });
	});

	test("with no match, it is refused before anything is read about the row's dates", async () => {
		expect(
			await refusal(edit(golden.id(24), { currency: "KWD" }, { now: NOW })),
		).toMatchObject({ code: "currency_mismatch", fields: {} });
	});
});

describe("the entry window on an edit, in a zone with clock changes (TIME-7, BR-F03-11)", () => {
	const NY = { profile: { timezone: "America/New_York" } };
	const on = (day: string) => ({
		occurredAt: `${day}T16:00:00Z`,
		occurredOn: day,
	});

	// The window is the stored recording date in the profile zone and the 10 days before it,
	// counted in dates, so a clock change inside it adds or takes away no day.
	test.each([
		// 01:30 EDT on the fall-back day, and 01:30 EST an hour later: one recording date.
		["2026-11-01T05:30:00.000Z", "2026-10-22", "2026-11-01"],
		["2026-11-01T06:30:00.000Z", "2026-10-22", "2026-11-01"],
		// 03:30 EDT on the spring-forward day.
		["2026-03-08T07:30:00.000Z", "2026-02-26", "2026-03-08"],
	])("recorded %s: %s to %s", async (createdAt, firstOn, lastOn) => {
		const recorded = row({
			createdAt,
			occurredAt: createdAt,
			occurredOn: lastOn,
		});
		const later = { ...NY, now: "2026-12-20T12:00:00.000Z" };
		const first = await edit(recorded, on(firstOn), later);
		expect(first.result).toMatchObject({ occurredOn: firstOn });
		const before = new Date(Date.parse(`${firstOn}T00:00:00Z`) - 86_400_000)
			.toISOString()
			.slice(0, 10);
		expect(await refusal(edit(recorded, on(before), later))).toEqual({
			code: "date_out_of_window",
			fields: {
				occurredOn: "Choose a date in this Transaction's entry window.",
			},
			details: { firstOn, lastOn },
		});
	});

	test("the same row has another window in another profile zone", async () => {
		// 07:30Z on 8 March is 03:30 EDT on the 8th in New York, and still 23:30 PST on the 7th in
		// Los Angeles, so its recording date and its window are a day apart.
		// Its own date is the 7th, so changing it to the 8th is a change the window must check.
		const recorded = row({
			createdAt: "2026-03-08T07:30:00.000Z",
			occurredAt: "2026-03-07T16:00:00Z",
			occurredOn: "2026-03-07",
		});
		const now = "2026-12-20T12:00:00.000Z";
		const newYork = { now, profile: { timezone: "America/New_York" } };
		const losAngeles = { now, profile: { timezone: "America/Los_Angeles" } };
		// New York: 26 February to 8 March. Los Angeles: 25 February to 7 March.
		expect(
			await refusal(edit(recorded, on("2026-02-25"), newYork)),
		).toMatchObject({
			code: "date_out_of_window",
			details: { firstOn: "2026-02-26", lastOn: "2026-03-08" },
		});
		expect(
			(await edit(recorded, on("2026-02-25"), losAngeles)).result,
		).toMatchObject({
			occurredOn: "2026-02-25",
		});
		expect(
			await refusal(edit(recorded, on("2026-03-08"), losAngeles)),
		).toMatchObject({
			code: "date_out_of_window",
			details: { firstOn: "2026-02-25", lastOn: "2026-03-07" },
		});
		expect(
			(await edit(recorded, on("2026-03-08"), newYork)).result,
		).toMatchObject({
			occurredOn: "2026-03-08",
		});
	});
});
