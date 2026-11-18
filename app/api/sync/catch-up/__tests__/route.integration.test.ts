import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { insertProfile, loadGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import {
	closeOwner,
	connectOwner,
	dataOf,
	errorOf,
	type SignedIn,
	freezeGoldenClock,
} from "@/server/api/__tests__/endpoint";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { addSubscription } from "@/server/dal/subscriptions/__tests__/helpers";
import { POST } from "../route";

/** `POST /api/sync/catch-up` (F05 section 11, BR-F05-06, D-256) through the route wrapper, real
 * sessions and the golden clock. The catch-up itself is tested on `bootCatchUp`; these show the
 * answer, the queue's skip and the wrapper's refusals. Every test that writes has a user of its
 * own. */

type User = SignedIn;

let owner: Client;
let noProfile: User;
const users: string[] = [];

beforeAll(async () => {
	owner = await connectOwner();
	noProfile = await signedInUser(owner, "boot-route-new");
	users.push(noProfile.id);
});

afterAll(() => closeOwner(owner, users));

freezeGoldenClock();

/** A user with golden's data as it stood before the first request of 2 November: row 27 is
 * missing (AC-F05-03). */
async function beforeFirstRequest(label: string): Promise<User> {
	const user = await signedInUser(owner, label);
	users.push(user.id);
	await loadGolden(owner, user.id, { beforeCatchUp: true });
	return user;
}

const boot = (
	cookie: string | null,
	{
		body = {},
		headers = {},
	}: { body?: unknown; headers?: Record<string, string | null> } = {},
) =>
	call(POST, "/api/sync/catch-up", {
		method: "POST",
		body,
		headers,
		...(cookie === null ? {} : { cookie }),
	});

/** The user's Subscription charges. */
async function chargeCount(userId: string): Promise<number> {
	const { rows } = await owner.query<{ n: number }>(
		"SELECT count(*)::int AS n FROM app.transactions WHERE user_id = $1 AND source = 'subscription'",
		[userId],
	);
	return rows[0]!.n;
}

// `pricesUpdated` is the wrapper's daily pass (BR-F05-06). No pass step writes prices before F07,
// so it is false here; F07 adds the step and its true case.
describe("POST /api/sync/catch-up", () => {
	// AC-F05-03: the first request on 2 November creates row 27 only; repeating creates nothing.
	test("creates row 27 only, then nothing when repeated", async () => {
		const user = await beforeFirstRequest("boot-route-first");
		const before = await chargeCount(user.id);
		const first = await boot(user.cookie);
		expect(first.status).toBe(200);
		expect(dataOf(first.body)).toMatchObject({
			skipped: false,
			chargesCreated: 1,
		});
		expect(dataOf(first.body)).toMatchObject({ pricesUpdated: false });
		expect(await chargeCount(user.id)).toBe(before + 1);
		const { rows } = await owner.query(
			`SELECT amount_minor::text AS amount, due_on::text AS due FROM app.transactions
			 WHERE user_id = $1 AND source = 'subscription' ORDER BY due_on DESC LIMIT 1`,
			[user.id],
		);
		expect(rows[0]).toEqual({ amount: "1800000", due: "2026-11-01" });
		const again = await boot(user.cookie);
		expect(dataOf(again.body)).toMatchObject({
			skipped: false,
			chargesCreated: 0,
		});
		expect(await chargeCount(user.id)).toBe(before + 1);
	});

	test("catches every Subscription up: a Subscription with three missed dates gets three charges", async () => {
		const user = await signedInUser(owner, "boot-route-many");
		users.push(user.id);
		await insertProfile(owner, user.id);
		await addSubscription(owner, user.id, {
			startDate: "2026-08-05",
			chargesFrom: "2026-08-05",
		});
		const { status, body } = await boot(user.cookie);
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({ skipped: false, chargesCreated: 3 });
		expect(await chargeCount(user.id)).toBe(3);
	});

	// AC-F05-03: with `Daybook-Queue: pending` it returns skipped: true.
	test("with the Daybook-Queue: pending header it does nothing and answers skipped", async () => {
		const user = await beforeFirstRequest("boot-route-queue-header");
		const before = await chargeCount(user.id);
		const { status, body } = await boot(user.cookie, {
			headers: { "daybook-queue": "pending" },
		});
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({ skipped: true, chargesCreated: 0 });
		expect(dataOf(body)).toMatchObject({ pricesUpdated: false });
		expect(await chargeCount(user.id)).toBe(before);
	});

	test("with the daybook_queue=pending cookie it does nothing and answers skipped", async () => {
		const user = await beforeFirstRequest("boot-route-queue-cookie");
		const before = await chargeCount(user.id);
		const { body } = await boot(`${user.cookie}; daybook_queue=pending`);
		expect(dataOf(body)).toMatchObject({ skipped: true, chargesCreated: 0 });
		expect(await chargeCount(user.id)).toBe(before);
	});

	test("with any other queue value it runs", async () => {
		const user = await beforeFirstRequest("boot-route-queue-other");
		const { body } = await boot(user.cookie, {
			headers: { "daybook-queue": "empty" },
		});
		expect(dataOf(body)).toMatchObject({ skipped: false, chargesCreated: 1 });
	});

	test("takes no Idempotency-Key: a call without one is accepted", async () => {
		const user = await beforeFirstRequest("boot-route-no-key");
		const { status, body } = await boot(user.cookie, {
			headers: { "idempotency-key": null },
		});
		expect(status).toBe(200);
		expect(dataOf(body)).toMatchObject({ chargesCreated: 1 });
	});

	test("never touches another user's Subscriptions", async () => {
		const mine = await beforeFirstRequest("boot-route-mine");
		const theirs = await beforeFirstRequest("boot-route-theirs");
		const before = await chargeCount(theirs.id);
		await boot(mine.cookie);
		expect(await chargeCount(theirs.id)).toBe(before);
	});

	test("a body that is not {} is 422 on the unknown field, and nothing is made", async () => {
		const user = await beforeFirstRequest("boot-route-body");
		const before = await chargeCount(user.id);
		const { status, body } = await boot(user.cookie, { body: { force: true } });
		expect(status).toBe(422);
		expect(errorOf(body).code).toBe("validation_failed");
		expect(errorOf(body).fields).toHaveProperty("force");
		expect(await chargeCount(user.id)).toBe(before);
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await boot(null)).status).toBe(401);
		const { status, body } = await boot(noProfile.cookie);
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});

	test("a request from another origin is 403 cross_origin, and nothing is made", async () => {
		const user = await beforeFirstRequest("boot-route-origin");
		const before = await chargeCount(user.id);
		const { status, body } = await boot(user.cookie, {
			headers: { origin: "https://evil.example" },
		});
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("cross_origin");
		expect(await chargeCount(user.id)).toBe(before);
	});

	test("a body that is not JSON is 415, and nothing is made", async () => {
		const user = await beforeFirstRequest("boot-route-media");
		const before = await chargeCount(user.id);
		const { status } = await boot(user.cookie, {
			headers: { "content-type": "text/plain" },
		});
		expect(status).toBe(415);
		expect(await chargeCount(user.id)).toBe(before);
	});
});
