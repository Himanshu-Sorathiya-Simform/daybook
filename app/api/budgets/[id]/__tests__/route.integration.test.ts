import { randomUUID, randomUUIDv7 } from "node:crypto";
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

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { insertProfile } from "../../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/__tests__/helpers";
import { parseOwnerEnv } from "@/server/env";
import { DELETE as DELETE_MONTH } from "../overrides/[month]/route";
import { DELETE, PATCH } from "../route";

/** `PATCH` and `DELETE /api/budgets/[id]` and `DELETE /api/budgets/[id]/overrides/[month]` (F04
 * section 11; D-561) through the route wrapper, real sessions and the golden clock. Each test
 * writes its own committed Budget; the rules are tested on `editBudget`, `removeMonthLimit`
 * and `deleteBudget`. */

type User = { id: string; cookie: string };

let owner: Client;
let me: User;
let other: User;
let noProfile: User;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	me = await signedInUser(owner, "budget-id-route");
	await insertProfile(owner, me.id);
	other = await signedInUser(owner, "budget-id-route-other");
	await insertProfile(owner, other.id);
	noProfile = await signedInUser(owner, "budget-id-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[me?.id, other?.id, noProfile?.id].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
});

afterEach(() => {
	vi.useRealTimers();
});

const FOOD = [
	{ from: "2026-09", limitMinor: 600000 },
	{ from: "2026-10", limitMinor: 500000 },
];

/** `who`'s committed food Budget, golden's at version 2, replacing any earlier one; with
 * `overrides` when given. Returns its id. */
async function food(who: User = me, overrides: unknown[] = []): Promise<string> {
	const id = uuidV7At(GOLDEN_NOW);
	await owner.query(
		"DELETE FROM app.budgets WHERE user_id = $1 AND category = 'food'",
		[who.id],
	);
	await owner.query(
		`INSERT INTO app.budgets (id, user_id, created_at, updated_at, category, schedule, overrides, version)
		 VALUES ($1, $2, $3, $3, 'food', $4, $5, 2)`,
		[id, who.id, GOLDEN_NOW, JSON.stringify(FOOD), JSON.stringify(overrides)],
	);
	return id;
}

/** The stored Budget, or null. */
async function storedBudget(id: string) {
	const { rows } = await owner.query<{
		schedule: unknown;
		overrides: unknown;
		version: number;
	}>("SELECT schedule, overrides, version FROM app.budgets WHERE id = $1", [id]);
	return rows[0] ?? null;
}

type Options = { version?: string | null; cookie?: string | null; key?: string };

function send(
	handler: typeof PATCH,
	method: "PATCH" | "DELETE",
	path: string,
	params: Record<string, string>,
	input: unknown,
	{ version = "2", cookie = me.cookie, key }: Options = {},
) {
	return call(handler, path, {
		method,
		params,
		body: input,
		...(cookie === null ? {} : { cookie }),
		headers: {
			"if-match": version === null ? null : `"${version}"`,
			...(key ? { "idempotency-key": key } : {}),
		},
	});
}

const patch = (id: string, input: unknown, options?: Options) =>
	send(PATCH, "PATCH", `/api/budgets/${id}`, { id }, input, options);
const remove = (id: string, options?: Options) =>
	send(DELETE, "DELETE", `/api/budgets/${id}`, { id }, {}, options);
const removeMonth = (
	id: string,
	month: string,
	options?: Options,
	input: unknown = {},
) =>
	send(
		DELETE_MONTH,
		"DELETE",
		`/api/budgets/${id}/overrides/${month}`,
		{ id, month },
		input,
		options,
	);

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

const SEVEN_FROM_SEPTEMBER = {
	from: "2026-09",
	limitMinor: 700000,
	currency: "INR",
};

describe("PATCH /api/budgets/[id]", () => {
	// AC-F04-03 through the wrapper.
	test("a change from a month answers 200 with the Budget and the currency", async () => {
		const id = await food();
		const { status, body } = await patch(id, SEVEN_FROM_SEPTEMBER);
		expect(status).toBe(200);
		expect(body).toEqual({
			data: {
				id,
				category: "food",
				schedule: [{ from: "2026-09", limitMinor: 700000 }],
				overrides: [],
				version: 3,
				demo: false,
				createdAt: GOLDEN_NOW,
				updatedAt: GOLDEN_NOW,
				currency: "INR",
			},
		});
		expect(await storedBudget(id)).toMatchObject({ version: 3 });
	});

	// Section 15's one-month body.
	test("a one-month change answers 200 with the one-month limit", async () => {
		const id = await food();
		const { status, body } = await patch(id, {
			month: "2026-10",
			limitMinor: 800000,
			currency: "INR",
			scope: "month",
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({
			data: {
				overrides: [{ month: "2026-10", limitMinor: 800000 }],
				version: 3,
			},
		});
	});

	// AC-F04-18
	test("a restoring change answers 200 with the lists it was sent", async () => {
		const id = await food();
		const { status, body } = await patch(id, {
			schedule: [{ from: "2026-09", limitMinor: 600000 }],
			overrides: [{ month: "2026-10", limitMinor: null }],
			currency: "INR",
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({
			data: {
				schedule: [{ from: "2026-09", limitMinor: 600000 }],
				overrides: [{ month: "2026-10", limitMinor: null }],
			},
		});
	});

	// AC-F04-24
	test("a change that changes nothing answers 200 and keeps the version", async () => {
		const id = await food();
		const { status, body } = await patch(id, {
			from: "2026-11",
			limitMinor: 500000,
			currency: "INR",
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({ data: { version: 2 } });
	});

	// AC-F04-09
	test("a stale If-Match is 409 with the current Budget, and nothing changes", async () => {
		const id = await food();
		const { status, body } = await patch(id, SEVEN_FROM_SEPTEMBER, {
			version: "1",
		});
		expect(status).toBe(409);
		expect(errorOf(body)).toMatchObject({
			code: "version_conflict",
			details: {
				current: {
					id,
					schedule: FOOD,
					overrides: [],
					version: 2,
					currency: "INR",
				},
			},
		});
		expect(await storedBudget(id)).toMatchObject({ schedule: FOOD, version: 2 });
	});

	// AC-F04-04
	test("a stop from the first month is 422 on from", async () => {
		const id = await food();
		const { status, body } = await patch(id, {
			from: "2026-09",
			limitMinor: null,
		});
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({
			from: "This would remove every month. Delete the Budget instead.",
		});
	});

	// AC-F04-11
	test("a month outside the range is 422 with the range", async () => {
		const id = await food();
		const { status, body } = await patch(id, {
			...SEVEN_FROM_SEPTEMBER,
			from: "2027-12",
		});
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({
			from: "Choose a month from Nov 2023 to Nov 2027.",
		});
	});

	test("a body the schema refuses is 422, and nothing changes", async () => {
		const id = await food();
		for (const input of [
			{},
			{ from: "2026-09", limitMinor: 700000 },
			{ version: 3 },
		]) {
			const { status, body } = await patch(id, input);
			expect(status).toBe(422);
			expect(errorOf(body).code).toBe("validation_failed");
		}
		expect(await storedBudget(id)).toMatchObject({ version: 2 });
	});

	test("another currency is 422 currency_mismatch", async () => {
		const id = await food();
		const { status, body } = await patch(id, {
			...SEVEN_FROM_SEPTEMBER,
			currency: "EUR",
		});
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("currency_mismatch");
	});

	test("replaying a PATCH with the same key answers the same and raises the version once", async () => {
		const id = await food();
		const key = randomUUIDv7();
		const first = await patch(id, SEVEN_FROM_SEPTEMBER, { key });
		const again = await patch(id, SEVEN_FROM_SEPTEMBER, { key });
		expect(first.status).toBe(200);
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect(await storedBudget(id)).toMatchObject({ version: 3 });
	});

	test("the same key with another body is 422 idempotency_key_reused", async () => {
		const id = await food();
		const key = randomUUIDv7();
		await patch(id, SEVEN_FROM_SEPTEMBER, { key });
		const { status, body } = await patch(
			id,
			{ ...SEVEN_FROM_SEPTEMBER, limitMinor: 710000 },
			{ key, version: "3" },
		);
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("idempotency_key_reused");
	});

	test("no If-Match is 400, and nothing changes", async () => {
		const id = await food();
		const { status } = await patch(id, SEVEN_FROM_SEPTEMBER, { version: null });
		expect(status).toBe(400);
		expect(await storedBudget(id)).toMatchObject({ version: 2 });
	});

	test("an id that is no UUID, an unknown one, or another user's is 404", async () => {
		const theirs = await food(other);
		for (const id of ["food", randomUUID(), theirs]) {
			const { status, body } = await patch(id, SEVEN_FROM_SEPTEMBER);
			expect(status).toBe(404);
			expect(errorOf(body).code).toBe("not_found");
		}
		expect(await storedBudget(theirs)).toMatchObject({
			schedule: FOOD,
			version: 2,
		});
	});
});

describe("DELETE /api/budgets/[id] (BR-F04-06)", () => {
	test("answers 204 with no body, and the Budget is gone", async () => {
		const id = await food();
		const { status, body } = await remove(id);
		expect(status).toBe(204);
		expect(body).toBeNull();
		expect(await storedBudget(id)).toBeNull();
	});

	test("a stale If-Match is 409 with the Budget, and it stays", async () => {
		const id = await food();
		const { status, body } = await remove(id, { version: "1" });
		expect(status).toBe(409);
		expect(errorOf(body).details).toMatchObject({ current: { id, version: 2 } });
		expect(await storedBudget(id)).not.toBeNull();
	});

	test("a second delete is 404, which the client counts as done", async () => {
		const id = await food();
		await remove(id);
		expect((await remove(id)).status).toBe(404);
	});

	test("replaying a DELETE with the same key answers 204 again", async () => {
		const id = await food();
		const key = randomUUIDv7();
		const answers = [await remove(id, { key }), await remove(id, { key })];
		expect(answers.map(({ status }) => status)).toEqual([204, 204]);
	});

	test("a body with a field is 422, and no If-Match 400; the Budget stays", async () => {
		const id = await food();
		const withField = await send(
			DELETE,
			"DELETE",
			`/api/budgets/${id}`,
			{ id },
			{ version: 2 },
		);
		expect(withField.status).toBe(422);
		expect((await remove(id, { version: null })).status).toBe(400);
		expect(await storedBudget(id)).not.toBeNull();
	});

	test("another user's Budget is 404, and it stays", async () => {
		const theirs = await food(other);
		expect((await remove(theirs)).status).toBe(404);
		expect(await storedBudget(theirs)).not.toBeNull();
	});
});

describe("DELETE /api/budgets/[id]/overrides/[month] (BR-F04-25)", () => {
	const OCTOBER = { month: "2026-10", limitMinor: 800000 };

	// AC-F04-17
	test("answers 200 with the Budget at a new version, without that one-month limit", async () => {
		const id = await food(me, [OCTOBER]);
		const { status, body } = await removeMonth(id, "2026-10");
		expect(status).toBe(200);
		expect(body).toMatchObject({
			data: { id, schedule: FOOD, overrides: [], version: 3, currency: "INR" },
		});
		expect(await storedBudget(id)).toMatchObject({ overrides: [], version: 3 });
	});

	// AC-F04-17
	test("a month with no one-month limit, or a malformed month, is 404", async () => {
		const id = await food(me, [OCTOBER]);
		for (const month of ["2026-11", "2026-1", "october"]) {
			const { status, body } = await removeMonth(id, month);
			expect(status).toBe(404);
			expect(errorOf(body).code).toBe("not_found");
		}
		expect(await storedBudget(id)).toMatchObject({
			overrides: [OCTOBER],
			version: 2,
		});
	});

	// AC-F04-17
	test("a stale If-Match is 409 with the Budget", async () => {
		const id = await food(me, [OCTOBER]);
		const { status, body } = await removeMonth(id, "2026-10", { version: "1" });
		expect(status).toBe(409);
		expect(errorOf(body).details).toMatchObject({
			current: { id, overrides: [OCTOBER], version: 2 },
		});
	});

	test("replaying with the same key answers the same and raises the version once", async () => {
		const id = await food(me, [OCTOBER]);
		const key = randomUUIDv7();
		const first = await removeMonth(id, "2026-10", { key });
		const again = await removeMonth(id, "2026-10", { key });
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect(await storedBudget(id)).toMatchObject({ version: 3 });
	});

	test("a body with a field is 422, and no If-Match 400", async () => {
		const id = await food(me, [OCTOBER]);
		expect(
			(await removeMonth(id, "2026-10", {}, { month: "2026-10" })).status,
		).toBe(422);
		expect((await removeMonth(id, "2026-10", { version: null })).status).toBe(
			400,
		);
		expect(await storedBudget(id)).toMatchObject({ overrides: [OCTOBER] });
	});

	test("another user's Budget is 404, and it keeps its one-month limit", async () => {
		const theirs = await food(other, [OCTOBER]);
		expect((await removeMonth(theirs, "2026-10")).status).toBe(404);
		expect(await storedBudget(theirs)).toMatchObject({ overrides: [OCTOBER] });
	});
});

describe("the wrapper's refusals", () => {
	test("no session is 401 on every method", async () => {
		const id = await food();
		expect(
			(await patch(id, SEVEN_FROM_SEPTEMBER, { cookie: null })).status,
		).toBe(401);
		expect((await remove(id, { cookie: null })).status).toBe(401);
		expect((await removeMonth(id, "2026-10", { cookie: null })).status).toBe(
			401,
		);
	});

	test("no profile is 403 profile_required on every method", async () => {
		const id = await food();
		for (const answer of [
			await patch(id, SEVEN_FROM_SEPTEMBER, { cookie: noProfile.cookie }),
			await remove(id, { cookie: noProfile.cookie }),
			await removeMonth(id, "2026-10", { cookie: noProfile.cookie }),
		]) {
			expect(answer.status).toBe(403);
			expect(errorOf(answer.body).code).toBe("profile_required");
		}
		expect(await storedBudget(id)).toMatchObject({ version: 2 });
	});

	test.each([
		['W/"2"', "a weak validator"],
		['"0"', "version 0"],
		["2", "no quotes"],
		["*", "the wildcard"],
	])("If-Match %s is 400 and changes nothing: %s", async (header) => {
		const id = await food();
		const answer = await call(PATCH, `/api/budgets/${id}`, {
			method: "PATCH",
			params: { id },
			cookie: me.cookie,
			body: SEVEN_FROM_SEPTEMBER,
			headers: { "if-match": header },
		});
		expect(answer.status).toBe(400);
		expect(await storedBudget(id)).toMatchObject({ version: 2 });
	});
});
