import { randomUUIDv7 } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import {
	closeOwner,
	connectOwner,
	dataOf,
	errorOf,
	type GoldenSignedIn,
	goldenSignedIn,
	freezeGoldenClock,
	routeUsers,
	type WriteOptions as Options,
} from "@/server/api/__tests__/endpoint";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { DELETE, PATCH } from "../route";

/** `PATCH` and `DELETE /api/subscriptions/[id]` (F05 section 11) through the route wrapper, real
 * sessions and the golden clock. The change and delete rules are tested on `changeSubscription`
 * and `deleteSubscription`; these show each answer, header and refusal the wrapper gives. Every
 * test that writes has a golden user of its own. */

type User = GoldenSignedIn;

let owner: Client;
let golden: User;
let other: User;
let noProfile: { id: string; cookie: string };
const users: string[] = [];

const goldenUser = (label: string) => goldenSignedIn(owner, users, label);

beforeAll(async () => {
	owner = await connectOwner();
	({ golden, other, noProfile } = await routeUsers(owner, users, "sub-id-route"));
});

afterAll(() => closeOwner(owner, users));

freezeGoldenClock();

const send = (
	handler: typeof PATCH,
	method: "PATCH" | "DELETE",
	id: string,
	input: unknown,
	{ version = "1", cookie, key, headers = {} }: Options = {},
) =>
	call(handler, `/api/subscriptions/${id}`, {
		method,
		params: { id },
		body: input,
		...(cookie === null || cookie === undefined ? {} : { cookie }),
		headers: {
			"if-match": version === null ? null : `"${version}"`,
			...(key ? { "idempotency-key": key } : {}),
			...headers,
		},
	});

const patch = (user: User, input: unknown, options: Options = {}) =>
	send(PATCH, "PATCH", options.id ?? user.subscription("netflix"), input, {
		cookie: user.cookie,
		...options,
	});

const remove = (user: User, input: unknown, options: Options = {}) =>
	send(DELETE, "DELETE", options.id ?? user.subscription("netflix"), input, {
		cookie: user.cookie,
		...options,
	});

/** A Subscription's stored version and name, and its linked charges. */
async function stored(id: string) {
	const { rows } = await owner.query<{
		version: number;
		name: string;
		amount: string;
		charges: number;
	}>(
		`SELECT s.version, s.name, s.amount_minor::text AS amount,
		        (SELECT count(*)::int FROM app.transactions t WHERE t.subscription_id = s.id) AS charges
		 FROM app.subscriptions s WHERE s.id = $1`,
		[id],
	);
	return rows[0];
}

const change = (fields: Record<string, unknown> = {}) => ({
	changedAt: GOLDEN_NOW,
	...fields,
});

describe("PATCH /api/subscriptions/[id]", () => {
	// F05 section 11, BR-F05-08, D-609
	test("answers 200 with the Subscription, the change date, the counts and the currency", async () => {
		const user = await goldenUser("sub-id-patch");
		const { status, body } = await patch(
			user,
			change({ name: "Netflix Premium" }),
		);
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({
			id: user.subscription("netflix"),
			name: "Netflix Premium",
			version: 2,
			changeDate: "2026-11-02",
			chargesCreated: 0,
			chargesUpdated: 0,
			chargesDeleted: 0,
			months: [],
			currency: "INR",
		});
		expect(await stored(user.subscription("netflix"))).toMatchObject({
			version: 2,
			name: "Netflix Premium",
		});
	});

	// AC-F05-21
	test("a rename with alsoPastCharges renames the past charges and counts them", async () => {
		const user = await goldenUser("sub-id-patch-past");
		const { status, body } = await patch(
			user,
			change({ name: "Netflix Premium", alsoPastCharges: true }),
		);
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({ chargesUpdated: 2, currency: "INR" });
		const { rows } = await owner.query(
			"SELECT payee FROM app.transactions WHERE subscription_id = $1 ORDER BY due_on",
			[user.subscription("netflix")],
		);
		expect(rows).toEqual([
			{ payee: "Netflix Premium" },
			{ payee: "Netflix Premium" },
		]);
	});

	// AC-F05-32
	test("a change with every field at its stored value answers 200 unchanged, at the same version", async () => {
		const user = await goldenUser("sub-id-patch-same");
		const { status, body } = await patch(user, change({ name: "Netflix" }));
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({
			version: 1,
			chargesCreated: 0,
			currency: "INR",
		});
		expect((await stored(user.subscription("netflix")))?.version).toBe(1);
	});

	test("a stale version is 409 with the current Subscription and currency, and nothing changes", async () => {
		const user = await goldenUser("sub-id-patch-stale");
		const { status, body } = await patch(user, change({ name: "Mine" }), {
			version: "2",
		});
		expect(status).toBe(409);
		expect(errorOf(body).code).toBe("version_conflict");
		expect(errorOf(body).details).toMatchObject({
			current: {
				id: user.subscription("netflix"),
				name: "Netflix",
				version: 1,
				currency: "INR",
			},
		});
		expect(await stored(user.subscription("netflix"))).toMatchObject({
			version: 1,
			name: "Netflix",
		});
	});

	test("the same key and body twice answer the same, and the version rises once", async () => {
		const user = await goldenUser("sub-id-patch-replay");
		const key = randomUUIDv7();
		const input = change({ name: "Netflix Premium" });
		const first = await patch(user, input, { key });
		const again = await patch(user, input, { key });
		expect(first.status).toBe(200);
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect((await stored(user.subscription("netflix")))?.version).toBe(2);
	});

	test("the same key with another body is 422 idempotency_key_reused", async () => {
		const user = await goldenUser("sub-id-patch-reused");
		const key = randomUUIDv7();
		await patch(user, change({ name: "One" }), { key });
		const { status, body } = await patch(user, change({ name: "Two" }), { key });
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("idempotency_key_reused");
	});

	test("a body the rules refuse is 422 with the field's message, and nothing changes", async () => {
		const user = await goldenUser("sub-id-patch-invalid");
		const { status, body } = await patch(user, change({ amountMinor: 80000 }));
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("validation_failed");
		expect(Object.keys(errorOf(body).fields)).toContain("currency");
		expect((await stored(user.subscription("netflix")))?.version).toBe(1);
	});

	test("another currency with an amount is 422 currency_mismatch", async () => {
		const user = await goldenUser("sub-id-patch-currency");
		const { status, body } = await patch(
			user,
			change({ amountMinor: 80000, currency: "USD" }),
		);
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("currency_mismatch");
	});

	test("an id that is not a UUID is 404", async () => {
		const { status, body } = await patch(golden, change({ name: "X" }), {
			id: "netflix",
		});
		expect(status).toBe(404);
		expect(errorOf(body).code).toBe("not_found");
	});

	test("another user's id is 404, and their Subscription stays as it was", async () => {
		const before = await stored(other.subscription("netflix"));
		const { status } = await patch(golden, change({ name: "Theirs" }), {
			id: other.subscription("netflix"),
		});
		expect(status).toBe(404);
		expect(await stored(other.subscription("netflix"))).toEqual(before);
	});

	// AC-F05-05: a sync request that carries Daybook-Queue: pending is not caught up first, so
	// the queued change lands before any lazy charge is made.
	test("with Daybook-Queue: pending the lazy catch-up does not run first; without it, it does", async () => {
		const queued = await signedInUser(owner, "sub-id-patch-queue");
		users.push(queued.id);
		const loaded = await loadGolden(owner, queued.id, { beforeCatchUp: true });
		const sunriseCharges = async () => {
			const { rows } = await owner.query<{ n: number }>(
				`SELECT count(*)::int AS n FROM app.transactions
				 WHERE subscription_id = $1 AND due_on = '2026-11-01'`,
				[loaded.subscription("sunrise")],
			);
			return rows[0]!.n;
		};
		expect(await sunriseCharges()).toBe(0);
		const user = { ...loaded, cookie: queued.cookie };
		const first = await patch(user, change({ note: "Queued" }), {
			headers: { "daybook-queue": "pending" },
		});
		expect(first.status).toBe(200);
		// Row 27, Sunrise Apartments' 1 November charge, waits for the boot or the next request.
		expect(await sunriseCharges()).toBe(0);
		const second = await patch(user, change({ note: "Next" }), { version: "2" });
		expect(second.status).toBe(200);
		expect(await sunriseCharges()).toBe(1);
	});

	test("no If-Match is 400", async () => {
		const { status, body } = await patch(golden, change({ name: "X" }), {
			version: null,
		});
		expect(status).toBe(400);
		expect(errorOf(body).code).toBe("bad_request");
	});

	test("no Idempotency-Key is 400, and nothing changes", async () => {
		const user = await goldenUser("sub-id-patch-no-key");
		const { status } = await patch(user, change({ name: "X" }), {
			headers: { "idempotency-key": null },
		});
		expect(status).toBe(400);
		expect((await stored(user.subscription("netflix")))?.version).toBe(1);
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect(
			(await patch(golden, change({ name: "X" }), { cookie: null })).status,
		).toBe(401);
		const { status, body } = await patch(golden, change({ name: "X" }), {
			cookie: noProfile.cookie,
		});
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});

	test("a request from another origin is 403 cross_origin", async () => {
		const user = await goldenUser("sub-id-patch-origin");
		const { status, body } = await patch(user, change({ name: "X" }), {
			headers: { origin: "https://evil.example" },
		});
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("cross_origin");
		expect((await stored(user.subscription("netflix")))?.version).toBe(1);
	});
});

describe("DELETE /api/subscriptions/[id]", () => {
	// AC-F05-08, BR-F05-14: golden Netflix keeps #5 and #16 as unlinked expenses.
	test("answers 200 with the counts, and keeps the charges as unlinked expenses", async () => {
		const user = await goldenUser("sub-id-delete");
		const { status, body } = await remove(user, { changedAt: GOLDEN_NOW });
		expect(status).toBe(200);
		expect(dataOf(body)).toEqual({
			changeDate: "2026-11-02",
			chargesCreated: 0,
			chargesKept: 2,
			chargesDeleted: 0,
			months: [],
		});
		expect(await stored(user.subscription("netflix"))).toBeUndefined();
		const { rows } = await owner.query(
			`SELECT count(*)::int AS n FROM app.transactions
			 WHERE user_id = $1 AND source = 'subscription' AND subscription_id IS NULL
			   AND payee = 'Netflix'`,
			[user.userId],
		);
		expect(rows[0]).toEqual({ n: 2 });
	});

	test("the same key twice answers the same, and nothing more is deleted", async () => {
		const user = await goldenUser("sub-id-delete-replay");
		const key = randomUUIDv7();
		const first = await remove(user, { changedAt: GOLDEN_NOW }, { key });
		const again = await remove(user, { changedAt: GOLDEN_NOW }, { key });
		expect(first.status).toBe(200);
		expect(again).toMatchObject({ status: 200, body: first.body });
	});

	// AC-F05-23
	test("the undo of an Add at version 1 deletes the Subscription and its unedited charges", async () => {
		const user = await goldenUser("sub-id-delete-undo");
		const { status, body } = await remove(user, {
			changedAt: GOLDEN_NOW,
			undo: "create",
		});
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({ chargesKept: 0, chargesDeleted: 2 });
		expect(await stored(user.subscription("netflix"))).toBeUndefined();
	});

	test("the undo of an Add at a later version is 409 with the Subscription as it is", async () => {
		const user = await goldenUser("sub-id-delete-undo-late");
		await owner.query("UPDATE app.subscriptions SET version = 2 WHERE id = $1", [
			user.subscription("netflix"),
		]);
		const { status, body } = await remove(
			user,
			{ changedAt: GOLDEN_NOW, undo: "create" },
			{ version: "2" },
		);
		expect(status).toBe(409);
		expect(errorOf(body).code).toBe("version_conflict");
		expect(errorOf(body).details).toMatchObject({
			current: {
				id: user.subscription("netflix"),
				version: 2,
				currency: "INR",
			},
		});
		expect(await stored(user.subscription("netflix"))).toBeDefined();
	});

	test("a stale version is 409 with the current Subscription, and nothing is deleted", async () => {
		const user = await goldenUser("sub-id-delete-stale");
		const { status, body } = await remove(
			user,
			{ changedAt: GOLDEN_NOW },
			{ version: "2" },
		);
		expect(status).toBe(409);
		expect(errorOf(body).code).toBe("version_conflict");
		expect((await stored(user.subscription("netflix")))?.charges).toBe(2);
	});

	test("a body without changedAt is 422, and nothing is deleted", async () => {
		const user = await goldenUser("sub-id-delete-invalid");
		const { status, body } = await remove(user, {});
		expect(status).toBe(422);
		expect(errorOf(body).fields).toHaveProperty("changedAt");
		expect(await stored(user.subscription("netflix"))).toBeDefined();
	});

	test("an id that is not a UUID, and another user's id, are 404", async () => {
		expect(
			(await remove(golden, { changedAt: GOLDEN_NOW }, { id: "netflix" }))
				.status,
		).toBe(404);
		const { status } = await remove(
			golden,
			{ changedAt: GOLDEN_NOW },
			{ id: other.subscription("netflix") },
		);
		expect(status).toBe(404);
		expect(await stored(other.subscription("netflix"))).toBeDefined();
	});

	test("no If-Match is 400, no Idempotency-Key is 400, no session is 401, no profile is 403", async () => {
		expect(
			(await remove(golden, { changedAt: GOLDEN_NOW }, { version: null }))
				.status,
		).toBe(400);
		expect(
			(
				await remove(
					golden,
					{ changedAt: GOLDEN_NOW },
					{ headers: { "idempotency-key": null } },
				)
			).status,
		).toBe(400);
		expect(
			(await remove(golden, { changedAt: GOLDEN_NOW }, { cookie: null }))
				.status,
		).toBe(401);
		const { status, body } = await remove(
			golden,
			{ changedAt: GOLDEN_NOW },
			{ cookie: noProfile.cookie },
		);
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
		expect(await stored(golden.subscription("netflix"))).toBeDefined();
	});
});
