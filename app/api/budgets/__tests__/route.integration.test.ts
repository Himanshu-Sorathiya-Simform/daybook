import { randomUUIDv7 } from "node:crypto";
import { Client } from "pg";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import {
	insertProfile,
	loadGolden,
	loadGoldenBudgets,
} from "../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/__tests__/helpers";
import { parseOwnerEnv, serverEnv } from "@/server/env";
import { GET, POST } from "../route";

/** `GET` and `POST /api/budgets` (F04 section 11) through the route wrapper, real sessions and
 * the golden clock. The rules themselves are tested on `budgetMonth` and `createBudget`; these
 * show each answer the wrapper gives. */

type User = { id: string; cookie: string };

let owner: Client;
let golden: User;
let goldenIds: Record<string, string>;
let other: User;
let noProfile: User;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await signedInUser(owner, "budgets-route");
	await loadGolden(owner, golden.id);
	goldenIds = Object.fromEntries(
		(await loadGoldenBudgets(owner, golden.id)).map((budget) => [
			budget.category,
			budget.id,
		]),
	);
	other = await signedInUser(owner, "budgets-route-other");
	await insertProfile(owner, other.id);
	noProfile = await signedInUser(owner, "budgets-route-new");
	users.push(golden.id, other.id, noProfile.id);
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
});

afterEach(() => {
	vi.useRealTimers();
});

/** A signed-in user with the golden profile and no Budgets, for a test that writes. */
async function freshUser(label: string): Promise<User> {
	const user = await signedInUser(owner, label);
	users.push(user.id);
	await insertProfile(owner, user.id);
	return user;
}

const errorOf = (body: unknown) =>
	(
		body as {
			error: {
				code: string;
				fields: Record<string, string>;
				details: Record<string, unknown>;
			};
		}
	).error;

const dataOf = <T = Record<string, unknown>>(body: unknown) =>
	(body as { data: T }).data;

const read = (query: string, cookie: string | null = golden.cookie) =>
	call(GET, `/api/budgets${query}`, cookie === null ? {} : { cookie });

const body = (fields: Record<string, unknown> = {}) => ({
	id: uuidV7At(GOLDEN_NOW),
	category: "health",
	from: "2026-11",
	limitMinor: 150000,
	currency: "INR",
	...fields,
});

const create = (
	input: unknown,
	{
		cookie,
		headers = {},
	}: { cookie: string | null; headers?: Record<string, string | null> },
) =>
	call(POST, "/api/budgets", {
		method: "POST",
		body: input,
		headers,
		...(cookie === null ? {} : { cookie }),
	});

/** The user's Budgets as stored, by category. */
async function stored(userId: string) {
	const { rows } = await owner.query<{ category: string; version: number }>(
		"SELECT category, version, schedule FROM app.budgets WHERE user_id = $1 ORDER BY category",
		[userId],
	);
	return rows;
}

describe("GET /api/budgets", () => {
	// F04 section 15
	test("answers golden October's month view with the currency", async () => {
		const { status, body: answer } = await read("?month=2026-10");
		expect(status).toBe(200);
		const view = dataOf<{
			month: string;
			currency: string;
			overall: unknown;
			budgets: { id: string; category: string; utilizationTenths: number }[];
			previous: unknown;
		}>(answer);
		expect(view).toMatchObject({
			month: "2026-10",
			currency: "INR",
			overall: {
				limitMinor: 1100000,
				spentMinor: 1316800,
				utilizationTenths: 1197,
				state: "over",
			},
			totalSpentMinor: 3116800,
			unbudgetedMinor: 1800000,
			unbudgeted: [
				{ category: "housing", spentMinor: 1800000, budgetId: null },
			],
			inactive: [],
			previous: {
				month: "2026-09",
				limitMinor: 1000000,
				spentMinor: 809900,
				budgetCount: 3,
				overCount: 0,
			},
		});
		expect(
			view.budgets.map((row) => [row.category, row.id, row.utilizationTenths]),
		).toEqual([
			["entertainment", goldenIds["entertainment"], 2148],
			["food", goldenIds["food"], 1244],
			["shopping", goldenIds["shopping"], 1000],
			["transportation", goldenIds["transportation"], 900],
		]);
	});

	test("answers the current month, November, without a month", async () => {
		const { status, body: answer } = await read("");
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({
			month: "2026-11",
			overall: { utilizationTenths: 38 },
		});
	});

	// AC-F04-11
	test.each(["2023-11", "2027-11"])(
		"answers %s, an end of the range",
		async (month) => {
			const { status, body: answer } = await read(`?month=${month}`);
			expect(status).toBe(200);
			expect(dataOf(answer)).toMatchObject({ month });
		},
	);

	// AC-F04-11
	test.each(["2023-10", "2027-12", "2026-13", "nope"])(
		"refuses month=%s with 400 naming it",
		async (month) => {
			const { status, body: answer } = await read(`?month=${month}`);
			expect(status).toBe(400);
			expect(errorOf(answer)).toMatchObject({
				code: "bad_request",
				details: { params: ["month"] },
			});
		},
	);

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await read("?month=2026-10", null)).status).toBe(401);
		const { status, body: answer } = await read(
			"?month=2026-10",
			noProfile.cookie,
		);
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
	});

	test("another user sees none of golden's Budgets or spending", async () => {
		const { body: answer } = await read("?month=2026-10", other.cookie);
		expect(dataOf(answer)).toMatchObject({
			budgets: [],
			unbudgeted: [],
			totalSpentMinor: 0,
		});
	});
});

describe("POST /api/budgets", () => {
	// F04 flow 7.1
	test("answers 201 with the new Budget and the currency, and stores it", async () => {
		const user = await freshUser("budgets-route-create");
		const input = body();
		const { status, body: answer } = await create(input, {
			cookie: user.cookie,
		});
		expect(status).toBe(201);
		expect(answer).toEqual({
			data: {
				id: input.id,
				category: "health",
				schedule: [{ from: "2026-11", limitMinor: 150000 }],
				overrides: [],
				version: 1,
				demo: false,
				createdAt: GOLDEN_NOW,
				updatedAt: GOLDEN_NOW,
				currency: "INR",
			},
		});
		expect(await stored(user.id)).toEqual([
			{
				category: "health",
				version: 1,
				schedule: [{ from: "2026-11", limitMinor: 150000 }],
			},
		]);
	});

	test("a second create of the same id under another key answers 200 with the Budget (API-5)", async () => {
		const user = await freshUser("budgets-route-again");
		const input = body();
		await create(input, { cookie: user.cookie });
		const { status, body: answer } = await create(
			{ ...input, limitMinor: 990000 },
			{ cookie: user.cookie },
		);
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({
			id: input.id,
			schedule: [{ from: "2026-11", limitMinor: 150000 }],
		});
		expect(await stored(user.id)).toHaveLength(1);
	});

	test("the same key and body twice answer the same, with one Budget", async () => {
		const user = await freshUser("budgets-route-replay");
		const input = body();
		const key = randomUUIDv7();
		const first = await create(input, {
			cookie: user.cookie,
			headers: { "idempotency-key": key },
		});
		const again = await create(input, {
			cookie: user.cookie,
			headers: { "idempotency-key": key },
		});
		expect(first.status).toBe(201);
		expect(again).toMatchObject({ status: 201, body: first.body });
		expect(await stored(user.id)).toHaveLength(1);
	});

	test("the same key with another body is 422 idempotency_key_reused", async () => {
		const user = await freshUser("budgets-route-reused");
		const key = randomUUIDv7();
		await create(body(), {
			cookie: user.cookie,
			headers: { "idempotency-key": key },
		});
		const { status, body: answer } = await create(body({ category: "travel" }), {
			cookie: user.cookie,
			headers: { "idempotency-key": key },
		});
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("idempotency_key_reused");
		expect(await stored(user.id)).toHaveLength(1);
	});

	// AC-F04-08, F04 flow 7.1's 409.
	test("a create for a category with a Budget is 409 budget_exists with that Budget", async () => {
		const { status, body: answer } = await create(body({ category: "food" }), {
			cookie: golden.cookie,
		});
		expect(status).toBe(409);
		expect(errorOf(answer)).toMatchObject({
			code: "budget_exists",
			details: {
				current: { id: goldenIds["food"], version: 2, currency: "INR" },
			},
		});
		expect(errorOf(answer)).toHaveProperty(
			"message",
			"A Budget for this category already exists.",
		);
	});

	test("another user's id is 409 id_conflict, and their Budget stays as it was", async () => {
		const user = await freshUser("budgets-route-conflict");
		const theirs = uuidV7At(GOLDEN_NOW);
		await owner.query(
			`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides)
			 VALUES ($1, $2, $3, $3, 'travel', '[{"from": "2026-11", "limitMinor": 1}]', '[]')`,
			[theirs, other.id, GOLDEN_NOW],
		);
		const { status, body: answer } = await create(body({ id: theirs }), {
			cookie: user.cookie,
		});
		expect(status).toBe(409);
		expect(errorOf(answer).code).toBe("id_conflict");
		expect(await stored(user.id)).toEqual([]);
		expect(await stored(other.id)).toEqual([
			{
				category: "travel",
				version: 1,
				schedule: [{ from: "2026-11", limitMinor: 1 }],
			},
		]);
	});

	// AC-F04-11
	test("a month outside the range is 422 on from, with the range", async () => {
		const user = await freshUser("budgets-route-range");
		const { status, body: answer } = await create(body({ from: "2023-10" }), {
			cookie: user.cookie,
		});
		expect(status).toBe(422);
		expect(errorOf(answer)).toMatchObject({
			code: "validation_failed",
			fields: { from: "Choose a month from Nov 2023 to Nov 2027." },
		});
	});

	test("a body the schema refuses is 422 with field paths, and nothing is stored", async () => {
		const user = await freshUser("budgets-route-invalid");
		const { status, body: answer } = await create(
			body({ category: "salary", extra: true }),
			{ cookie: user.cookie },
		);
		expect(status).toBe(422);
		expect(errorOf(answer).fields).toEqual({
			category: "Choose a category.",
			extra: "Remove this field.",
		});
		expect(await stored(user.id)).toEqual([]);
	});

	// AC-F04-28's currency check.
	test("another currency is 422 currency_mismatch", async () => {
		const user = await freshUser("budgets-route-currency");
		const { status, body: answer } = await create(body({ currency: "USD" }), {
			cookie: user.cookie,
		});
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("currency_mismatch");
	});

	// AC-F04-18
	test("a restoring create answers 201 with the lists it was sent", async () => {
		const user = await freshUser("budgets-route-restore");
		const input = {
			id: uuidV7At(GOLDEN_NOW),
			category: "food",
			schedule: [
				{ from: "2026-09", limitMinor: 600000 },
				{ from: "2026-10", limitMinor: 500000 },
			],
			overrides: [{ month: "2026-10", limitMinor: 800000 }],
			currency: "INR",
		};
		const { status, body: answer } = await create(input, {
			cookie: user.cookie,
		});
		expect(status).toBe(201);
		expect(dataOf(answer)).toMatchObject({
			schedule: input.schedule,
			overrides: input.overrides,
			version: 1,
		});
	});

	test("no Idempotency-Key is 400, and nothing is stored", async () => {
		const user = await freshUser("budgets-route-no-key");
		const { status, body: answer } = await create(body(), {
			cookie: user.cookie,
			headers: { "idempotency-key": null },
		});
		expect(status).toBe(400);
		expect(errorOf(answer).code).toBe("bad_request");
		expect(await stored(user.id)).toEqual([]);
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await create(body(), { cookie: null })).status).toBe(401);
		const { status, body: answer } = await create(body(), {
			cookie: noProfile.cookie,
		});
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
	});

	test("a request from another origin is 403 cross_origin", async () => {
		const user = await freshUser("budgets-route-origin");
		const { status, body: answer } = await create(body(), {
			cookie: user.cookie,
			headers: { origin: "https://evil.example" },
		});
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("cross_origin");
		expect(serverEnv().APP_ORIGIN).not.toBe("https://evil.example");
		expect(await stored(user.id)).toEqual([]);
	});
});
