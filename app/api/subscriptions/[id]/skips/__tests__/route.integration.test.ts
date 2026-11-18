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

import { GOLDEN_NOW } from "../../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import { DELETE as unskip } from "../[dueOn]/route";
import { POST as skip } from "../route";

/** `POST /api/subscriptions/[id]/skips` and `DELETE /api/subscriptions/[id]/skips/[dueOn]`
 * (F05 section 11, BR-F05-26, BR-F05-27) through the route wrapper, real sessions and the golden
 * clock. The skip rules are tested on `skipCharge` and `unskipCharge`; these show each answer,
 * header and refusal the wrapper gives. Every test that writes has a golden user of its own. */

type User = LoadedGolden & { cookie: string };

let owner: Client;
let golden: User;
let other: User;
let noProfile: { id: string; cookie: string };
const users: string[] = [];

async function goldenUser(label: string): Promise<User> {
	const user = await signedInUser(owner, label);
	users.push(user.id);
	return { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
}

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser("sub-skips-route");
	other = await goldenUser("sub-skips-route-other");
	noProfile = await signedInUser(owner, "sub-skips-route-new");
	users.push(noProfile.id);
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

type Options = {
	id?: string;
	version?: string | null;
	cookie?: string | null;
	key?: string;
	headers?: Record<string, string | null>;
};

const headersOf = ({ version = "1", key, headers = {} }: Options) => ({
	"if-match": version === null ? null : `"${version}"`,
	...(key ? { "idempotency-key": key } : {}),
	...headers,
});

const cookieOf = (user: User, { cookie }: Options) =>
	cookie === null ? {} : { cookie: cookie ?? user.cookie };

const skipOn = (user: User, input: unknown, options: Options = {}) => {
	const id = options.id ?? user.subscription("netflix");
	return call(skip, `/api/subscriptions/${id}/skips`, {
		method: "POST",
		params: { id },
		body: input,
		...cookieOf(user, options),
		headers: headersOf(options),
	});
};

const unskipOn = (
	user: User,
	dueOn: string,
	input: unknown,
	options: Options = {},
) => {
	const id = options.id ?? user.subscription("netflix");
	return call(unskip, `/api/subscriptions/${id}/skips/${dueOn}`, {
		method: "DELETE",
		params: { id, dueOn },
		body: input,
		...cookieOf(user, options),
		headers: headersOf(options),
	});
};

/** The Subscription's tombstoned dates, in order, and its version. */
async function skipsOf(id: string) {
	const { rows } = await owner.query<{ skips: string[]; version: number }>(
		`SELECT coalesce((SELECT array_agg(due_on::text ORDER BY due_on)
		                  FROM app.subscription_skips WHERE subscription_id = $1), '{}') AS skips,
		        (SELECT version FROM app.subscriptions WHERE id = $1) AS version`,
		[id],
	);
	return rows[0]!;
}

const body = (fields: Record<string, unknown> = {}) => ({
	dueOn: "2026-11-05",
	changedAt: GOLDEN_NOW,
	...fields,
});

describe("POST /api/subscriptions/[id]/skips", () => {
	// F05 section 5, "A skip": 5 November is tombstoned and next due becomes 5 December.
	test("answers 200 with the Subscription, the skip and the currency, and stores the tombstone", async () => {
		const user = await goldenUser("sub-skips-post");
		const { status, body: answer } = await skipOn(user, body());
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({
			id: user.subscription("netflix"),
			skips: ["2026-11-05"],
			nextDueOn: "2026-12-05",
			version: 2,
			currency: "INR",
		});
		expect(await skipsOf(user.subscription("netflix"))).toEqual({
			skips: ["2026-11-05"],
			version: 2,
		});
	});

	test("a repeated skip answers 200 with the Subscription unchanged, at the same version", async () => {
		const user = await goldenUser("sub-skips-post-again");
		await skipOn(user, body());
		const { status, body: answer } = await skipOn(user, body(), {
			version: "2",
		});
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({ skips: ["2026-11-05"], version: 2 });
	});

	test("the same key and body twice answer the same, and the version rises once", async () => {
		const user = await goldenUser("sub-skips-post-replay");
		const key = randomUUIDv7();
		const first = await skipOn(user, body(), { key });
		const again = await skipOn(user, body(), { key });
		expect(first.status).toBe(200);
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect((await skipsOf(user.subscription("netflix"))).version).toBe(2);
	});

	test("a date that is not an upcoming charge is 422 on dueOn, and nothing is written", async () => {
		const user = await goldenUser("sub-skips-post-past");
		const { status, body: answer } = await skipOn(
			user,
			body({ dueOn: "2026-10-05" }),
		);
		expect(status).toBe(422);
		expect(errorOf(answer).fields).toEqual({
			dueOn: "Only an upcoming charge can be skipped.",
		});
		expect(await skipsOf(user.subscription("netflix"))).toEqual({
			skips: [],
			version: 1,
		});
	});

	test("a stale version is 409 with the current Subscription, and nothing is written", async () => {
		const user = await goldenUser("sub-skips-post-stale");
		const { status, body: answer } = await skipOn(user, body(), {
			version: "2",
		});
		expect(status).toBe(409);
		expect(errorOf(answer).code).toBe("version_conflict");
		expect(errorOf(answer).details).toMatchObject({
			current: {
				id: user.subscription("netflix"),
				version: 1,
				currency: "INR",
			},
		});
		expect((await skipsOf(user.subscription("netflix"))).skips).toEqual([]);
	});

	test("a body the schema refuses is 422 with field paths", async () => {
		const { status, body: answer } = await skipOn(golden, { dueOn: "soon" });
		expect(status).toBe(422);
		expect(Object.keys(errorOf(answer).fields)).toEqual(
			expect.arrayContaining(["dueOn", "changedAt"]),
		);
	});

	test("an id that is not a UUID, and another user's id, are 404", async () => {
		expect((await skipOn(golden, body(), { id: "netflix" })).status).toBe(404);
		const { status } = await skipOn(golden, body(), {
			id: other.subscription("netflix"),
		});
		expect(status).toBe(404);
		expect((await skipsOf(other.subscription("netflix"))).skips).toEqual([]);
	});

	test("no If-Match is 400, no Idempotency-Key is 400, no session is 401, no profile is 403", async () => {
		expect((await skipOn(golden, body(), { version: null })).status).toBe(400);
		expect(
			(await skipOn(golden, body(), { headers: { "idempotency-key": null } }))
				.status,
		).toBe(400);
		expect((await skipOn(golden, body(), { cookie: null })).status).toBe(401);
		const { status, body: answer } = await skipOn(golden, body(), {
			cookie: noProfile.cookie,
		});
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
		expect((await skipsOf(golden.subscription("netflix"))).skips).toEqual([]);
	});

	test("a request from another origin is 403 cross_origin", async () => {
		const { status, body: answer } = await skipOn(golden, body(), {
			headers: { origin: "https://evil.example" },
		});
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("cross_origin");
		expect((await skipsOf(golden.subscription("netflix"))).skips).toEqual([]);
	});
});

describe("DELETE /api/subscriptions/[id]/skips/[dueOn]", () => {
	// AC-F05-27, F05 section 5, "A skip": Undo skip brings 5 November back.
	test("answers 200 with the Subscription, the skip removed and the currency", async () => {
		const user = await goldenUser("sub-unskip");
		await skipOn(user, body());
		const { status, body: answer } = await unskipOn(
			user,
			"2026-11-05",
			{ changedAt: GOLDEN_NOW },
			{ version: "2" },
		);
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({
			skips: [],
			nextDueOn: "2026-11-05",
			version: 3,
			currency: "INR",
		});
		expect(await skipsOf(user.subscription("netflix"))).toEqual({
			skips: [],
			version: 3,
		});
	});

	test("a date with no tombstone answers 200 with the Subscription unchanged", async () => {
		const user = await goldenUser("sub-unskip-none");
		const { status, body: answer } = await unskipOn(user, "2026-11-05", {
			changedAt: GOLDEN_NOW,
		});
		expect(status).toBe(200);
		expect(dataOf(answer)).toMatchObject({ skips: [], version: 1 });
	});

	test("a date that has passed is 422 on dueOn, and the tombstone stays", async () => {
		const user = await goldenUser("sub-unskip-passed");
		const cultGym = user.subscription("cultGym");
		const { status, body: answer } = await unskipOn(
			user,
			"2026-10-10",
			{ changedAt: GOLDEN_NOW },
			{ id: cultGym },
		);
		expect(status).toBe(422);
		expect(errorOf(answer).fields).toEqual({
			dueOn: "This charge date has passed, so it can't be brought back.",
		});
		expect((await skipsOf(cultGym)).skips).toEqual(["2026-10-10"]);
	});

	test("a stale version is 409 with the current Subscription", async () => {
		const user = await goldenUser("sub-unskip-stale");
		await skipOn(user, body());
		const { status, body: answer } = await unskipOn(user, "2026-11-05", {
			changedAt: GOLDEN_NOW,
		});
		expect(status).toBe(409);
		expect(errorOf(answer).details).toMatchObject({
			current: { version: 2, skips: ["2026-11-05"], currency: "INR" },
		});
		expect((await skipsOf(user.subscription("netflix"))).skips).toEqual([
			"2026-11-05",
		]);
	});

	test("the same key twice answers the same, and the version rises once", async () => {
		const user = await goldenUser("sub-unskip-replay");
		await skipOn(user, body());
		const key = randomUUIDv7();
		const options = { version: "2", key };
		const first = await unskipOn(
			user,
			"2026-11-05",
			{ changedAt: GOLDEN_NOW },
			options,
		);
		const again = await unskipOn(
			user,
			"2026-11-05",
			{ changedAt: GOLDEN_NOW },
			options,
		);
		expect(first.status).toBe(200);
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect((await skipsOf(user.subscription("netflix"))).version).toBe(3);
	});

	test("a malformed date, a malformed id and another user's id are 404", async () => {
		for (const dueOn of ["soon", "2026-13-40", "2026-11-5"]) {
			expect(
				(await unskipOn(golden, dueOn, { changedAt: GOLDEN_NOW })).status,
			).toBe(404);
		}
		expect(
			(
				await unskipOn(
					golden,
					"2026-11-05",
					{ changedAt: GOLDEN_NOW },
					{ id: "netflix" },
				)
			).status,
		).toBe(404);
		expect(
			(
				await unskipOn(
					golden,
					"2026-11-05",
					{ changedAt: GOLDEN_NOW },
					{ id: other.subscription("netflix") },
				)
			).status,
		).toBe(404);
	});

	test("a body without changedAt is 422", async () => {
		const { status, body: answer } = await unskipOn(golden, "2026-11-05", {});
		expect(status).toBe(422);
		expect(errorOf(answer).fields).toHaveProperty("changedAt");
	});

	test("no If-Match is 400, no Idempotency-Key is 400, no session is 401, no profile is 403", async () => {
		const input = { changedAt: GOLDEN_NOW };
		expect(
			(await unskipOn(golden, "2026-11-05", input, { version: null })).status,
		).toBe(400);
		expect(
			(
				await unskipOn(golden, "2026-11-05", input, {
					headers: { "idempotency-key": null },
				})
			).status,
		).toBe(400);
		expect(
			(await unskipOn(golden, "2026-11-05", input, { cookie: null })).status,
		).toBe(401);
		const { status, body: answer } = await unskipOn(
			golden,
			"2026-11-05",
			input,
			{
				cookie: noProfile.cookie,
			},
		);
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
	});
});
