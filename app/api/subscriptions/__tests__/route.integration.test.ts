import { randomUUIDv7 } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { insertProfile, loadGolden } from "../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import {
	closeOwner,
	connectOwner,
	dataOf,
	errorOf,
	expectCrossOriginRefused,
	expectSessionRefusals,
	freezeGoldenClock,
	sentTwiceWithOneKey,
	type SignedIn,
} from "@/server/api/__tests__/endpoint";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { addSubscription } from "@/server/dal/subscriptions/__tests__/helpers";
import { uuidV7At } from "@/server/dal/transactions/__tests__/helpers";
import { GET, POST } from "../route";

/** `GET` and `POST /api/subscriptions` (F05 section 11) through the route wrapper, real sessions
 * and the golden clock. The rules themselves are tested on `listSubscriptions` and
 * `createSubscription`; these show each answer the wrapper gives. */

type User = SignedIn;

let owner: Client;
let golden: User;
let goldenNetflix: string;
let other: User;
let noProfile: User;
const users: string[] = [];

beforeAll(async () => {
	owner = await connectOwner();
	golden = await signedInUser(owner, "subs-route");
	goldenNetflix = (await loadGolden(owner, golden.id)).subscription("netflix");
	other = await signedInUser(owner, "subs-route-other");
	await loadGolden(owner, other.id);
	noProfile = await signedInUser(owner, "subs-route-new");
	users.push(golden.id, other.id, noProfile.id);
});

afterAll(() => closeOwner(owner, users));

freezeGoldenClock();

/** A signed-in user with the golden profile and no Subscriptions, for a test that writes. */
async function freshUser(label: string): Promise<User> {
	const user = await signedInUser(owner, label);
	users.push(user.id);
	await insertProfile(owner, user.id);
	return user;
}

const read = (cookie: string | null = golden.cookie) =>
	call(GET, "/api/subscriptions", cookie === null ? {} : { cookie });

/** A create body as the client sends it: Netflix, monthly from 5 Sep 2025, no past charges. */
const body = (fields: Record<string, unknown> = {}) => ({
	id: uuidV7At(GOLDEN_NOW),
	name: "Netflix",
	amountMinor: 64900,
	currency: "INR",
	cadence: { unit: "month", every: 1 },
	startDate: "2025-09-05",
	category: "entertainment",
	note: null,
	backfill: false,
	createdAt: GOLDEN_NOW,
	...fields,
});

const create = (
	input: unknown,
	{
		cookie,
		headers = {},
	}: { cookie: string | null; headers?: Record<string, string | null> },
) =>
	call(POST, "/api/subscriptions", {
		method: "POST",
		body: input,
		headers,
		...(cookie === null ? {} : { cookie }),
	});

/** How many Subscriptions and linked charges the user has, as stored. */
async function counts(userId: string) {
	const { rows } = await owner.query<{ subscriptions: number; charges: number }>(
		`SELECT (SELECT count(*)::int FROM app.subscriptions WHERE user_id = $1) AS subscriptions,
		        (SELECT count(*)::int FROM app.transactions
		         WHERE user_id = $1 AND subscription_id IS NOT NULL) AS charges`,
		[userId],
	);
	return rows[0]!;
}

describe("GET /api/subscriptions", () => {
	// AC-F05-02, AC-F05-24: golden at the frozen clock.
	test("answers golden's four Subscriptions with the totals, the next 30 days and this month", async () => {
		const { status, body: answer } = await read();
		expect(status).toBe(200);
		const list = dataOf<{
			items: {
				id: string;
				name: string;
				skips: string[];
				paidMinor: number;
			}[];
			totals: Record<string, number>;
			upcomingTotalMinor: number;
			thisMonth: Record<string, number>;
			currency: string;
		}>(answer);
		expect(list.items.map((item) => item.name)).toHaveLength(4);
		expect(list.totals).toEqual({
			yearlyMinor: 24328700,
			monthlyMinor: 2027392,
			count: 4,
		});
		expect(list.upcomingTotalMinor).toBe(2014900);
		expect(list.thisMonth).toEqual({
			chargedMinor: 1800000,
			toComeMinor: 214900,
		});
		expect(list.currency).toBe("INR");
		const cultGym = list.items.find((item) => item.name === "Cult Gym");
		expect(cultGym).toMatchObject({ skips: ["2026-10-10"], paidMinor: 150000 });
	});

	test("a user with no Subscriptions gets an empty list with zeros and the currency", async () => {
		const user = await freshUser("subs-route-empty");
		const { status, body: answer } = await read(user.cookie);
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({
			items: [],
			totals: { yearlyMinor: 0, monthlyMinor: 0, count: 0 },
			upcoming: [],
			upcomingTotalMinor: 0,
			thisMonth: { chargedMinor: 0, toComeMinor: 0 },
			currency: "INR",
		});
	});

	test("another user's list holds only their own Subscriptions", async () => {
		const { body: answer } = await read(other.cookie);
		const ids = dataOf<{ items: { id: string }[] }>(answer).items.map(
			(item) => item.id,
		);
		expect(ids).toHaveLength(4);
		expect(ids).not.toContain(goldenNetflix);
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await read(null)).status).toBe(401);
		const { status, body: answer } = await read(noProfile.cookie);
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
	});
});

describe("POST /api/subscriptions", () => {
	// F05 section 7.1, D-609
	test("answers 201 with the Subscription, chargesCreated and the currency, and stores it", async () => {
		const user = await freshUser("subs-route-create");
		const input = body();
		const { status, body: answer } = await create(input, {
			cookie: user.cookie,
		});
		expect(status).toBe(201);
		expect(dataOf(answer)).toMatchObject({
			id: input.id,
			name: "Netflix",
			amountMinor: 64900,
			cadence: { unit: "month", every: 1 },
			startDate: "2025-09-05",
			category: "entertainment",
			version: 1,
			status: "active",
			nextDueOn: "2026-11-05",
			skips: [],
			chargesCreated: 0,
			currency: "INR",
		});
		expect(await counts(user.id)).toEqual({ subscriptions: 1, charges: 0 });
	});

	// AC-F05-04
	test("with backfill the past charges are made in the same request and counted", async () => {
		const user = await freshUser("subs-route-backfill");
		const { status, body: answer } = await create(body({ backfill: true }), {
			cookie: user.cookie,
		});
		expect(status).toBe(201);
		// 5 Sep 2025 to 5 Nov 2026, monthly: 15 due dates through today.
		const { chargesCreated } = dataOf<{ chargesCreated: number }>(answer);
		expect(chargesCreated).toBeGreaterThan(10);
		expect(await counts(user.id)).toEqual({
			subscriptions: 1,
			charges: chargesCreated,
		});
	});

	test("a second create of the same id under another key answers 200 with the Subscription and 0 charges (API-5)", async () => {
		const user = await freshUser("subs-route-again");
		const input = body();
		await create(input, { cookie: user.cookie });
		const { status, body: answer } = await create(
			{ ...input, name: "Changed", backfill: true },
			{ cookie: user.cookie },
		);
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({
			id: input.id,
			name: "Netflix",
			chargesCreated: 0,
			currency: "INR",
		});
		expect(await counts(user.id)).toEqual({ subscriptions: 1, charges: 0 });
	});

	test("the same key and body twice answer the same, with one Subscription", async () => {
		const user = await freshUser("subs-route-replay");
		const { first, again } = await sentTwiceWithOneKey(
			create,
			body(),
			user.cookie,
		);
		expect(first.status).toBe(201);
		expect(again).toMatchObject({ status: 201, body: first.body });
		expect(await counts(user.id)).toEqual({ subscriptions: 1, charges: 0 });
	});

	test("the same key with another body is 422 idempotency_key_reused", async () => {
		const user = await freshUser("subs-route-reused");
		const key = randomUUIDv7();
		await create(body(), {
			cookie: user.cookie,
			headers: { "idempotency-key": key },
		});
		const { status, body: answer } = await create(body({ name: "Other" }), {
			cookie: user.cookie,
			headers: { "idempotency-key": key },
		});
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("idempotency_key_reused");
	});

	test("another user's id is 409 id_conflict, and their Subscription stays as it was", async () => {
		const user = await freshUser("subs-route-conflict");
		// An id made at the golden clock, so it passes the id window and meets the conflict.
		const theirs = await addSubscription(owner, other.id);
		const { status, body: answer } = await create(body({ id: theirs.id }), {
			cookie: user.cookie,
		});
		expect(status).toBe(409);
		expect(errorOf(answer).code).toBe("id_conflict");
		expect(await counts(user.id)).toEqual({ subscriptions: 0, charges: 0 });
		const { rows } = await owner.query(
			"SELECT user_id, name, version FROM app.subscriptions WHERE id = $1",
			[theirs.id],
		);
		expect(rows[0]).toEqual({ user_id: other.id, name: "Netflix", version: 1 });
	});

	test("a body the schema refuses is 422 with field paths, and nothing is stored", async () => {
		const user = await freshUser("subs-route-invalid");
		const { status, body: answer } = await create(
			body({
				name: "",
				amountMinor: 0,
				cadence: { unit: "month", every: 99 },
			}),
			{ cookie: user.cookie },
		);
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("validation_failed");
		expect(Object.keys(errorOf(answer).fields)).toEqual(
			expect.arrayContaining(["name", "amountMinor"]),
		);
		expect(await counts(user.id)).toEqual({ subscriptions: 0, charges: 0 });
	});

	test("another currency is 422 currency_mismatch", async () => {
		const user = await freshUser("subs-route-currency");
		const { status, body: answer } = await create(body({ currency: "USD" }), {
			cookie: user.cookie,
		});
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("currency_mismatch");
		expect(await counts(user.id)).toEqual({ subscriptions: 0, charges: 0 });
	});

	test("no Idempotency-Key is 400, and nothing is stored", async () => {
		const user = await freshUser("subs-route-no-key");
		const { status, body: answer } = await create(body(), {
			cookie: user.cookie,
			headers: { "idempotency-key": null },
		});
		expect(status).toBe(400);
		expect(errorOf(answer).code).toBe("bad_request");
		expect(await counts(user.id)).toEqual({ subscriptions: 0, charges: 0 });
	});

	test("no session is 401, and no profile 403 profile_required", () =>
		expectSessionRefusals(create, body(), noProfile.cookie));

	test("a request from another origin is 403 cross_origin", async () => {
		const user = await freshUser("subs-route-origin");
		await expectCrossOriginRefused(create, body(), user.cookie);
		expect(await counts(user.id)).toEqual({ subscriptions: 0, charges: 0 });
	});
});
