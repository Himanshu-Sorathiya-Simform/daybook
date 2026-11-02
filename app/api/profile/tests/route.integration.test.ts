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
import { loadGolden } from "../../../../seed/load-golden";
import { PROFILE_MESSAGES } from "@/lib/profile";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv, serverEnv } from "@/server/env";
import { GET as listTransactions } from "../../transactions/route";
import { GET, POST } from "../route";

/** `GET` and `POST /api/profile` (F02 section 11, BR-F02-08, BR-F02-09, BR-F02-26, D-506)
 * through the route wrapper, real sessions and the golden clock, 2026-11-02T06:30Z. Every test
 * makes its own users, since a profile is one per user. */

type User = { id: string; cookie: string };

let owner: Client;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
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

async function newUser(label: string): Promise<User> {
	const signedIn = await signedInUser(owner, label);
	users.push(signedIn.id);
	return signedIn;
}

/** A user with the golden profile and its 27 Transactions (D-471). */
async function goldenUser(label: string): Promise<User> {
	const signedIn = await newUser(label);
	await loadGolden(owner, signedIn.id);
	return signedIn;
}

// F02 section 11's illustrative body.
const INDIA = {
	country: "IN",
	currency: "INR",
	timezone: "Asia/Kolkata",
	weekStart: "sunday",
};

const INDIA_BLOCK = {
	...INDIA,
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

const post = (
	who: User | null,
	body: unknown,
	headers: Record<string, string | null> = {},
) =>
	call(POST, "/api/profile", {
		method: "POST",
		...(who ? { cookie: who.cookie } : {}),
		body,
		headers,
	});

const read = (who: User | null) =>
	call(GET, "/api/profile", who ? { cookie: who.cookie } : {});

type StoredProfile = {
	id: string;
	country: string;
	currency: string;
	timezone: string;
	week_start: string;
	last_catch_up_on: string;
	version: number;
	created_at: Date;
	updated_at: Date;
	goals_chosen_at: Date | null;
};

async function storedProfiles(who: User): Promise<StoredProfile[]> {
	const { rows } = await owner.query<StoredProfile>(
		`SELECT id, country, currency, timezone, week_start, last_catch_up_on::text,
		        version, created_at, updated_at, goals_chosen_at
		 FROM app.profile WHERE user_id = $1`,
		[who.id],
	);
	return rows;
}

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("POST /api/profile (BR-F02-08)", () => {
	// AC-F02-06
	test("creates the profile: 201 with the profile block, version 1 and an editable currency", async () => {
		const who = await newUser("profile-create");
		const answer = await post(who, INDIA);
		expect(answer.status).toBe(201);
		expect(answer.body).toEqual({
			data: { profile: INDIA_BLOCK, version: 1, currencyEditable: true },
		});
	});

	// AC-F02-06
	test("stores the four fields, yesterday in the chosen zone as lastCatchUpOn, and the request clock", async () => {
		const who = await newUser("profile-stored");
		await post(who, INDIA);
		const [row, ...more] = await storedProfiles(who);
		expect(more).toEqual([]);
		expect(row).toMatchObject({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			week_start: "sunday",
			// 12:00 on 2 November in Kolkata.
			last_catch_up_on: "2026-11-01",
			version: 1,
			goals_chosen_at: null,
		});
		expect(row!.id).toMatch(UUID_V7);
		expect(row!.created_at.toISOString()).toBe(GOLDEN_NOW);
		expect(row!.updated_at.toISOString()).toBe(GOLDEN_NOW);
	});

	test("takes yesterday in the chosen zone, not in UTC or India", async () => {
		const who = await newUser("profile-los-angeles");
		const answer = await post(who, {
			country: "US",
			currency: "USD",
			timezone: "America/Los_Angeles",
			weekStart: "sunday",
		});
		expect(answer.status).toBe(201);
		// 22:30 on 1 November in Los Angeles (F02 section 9), so yesterday is 31 October.
		expect((await storedProfiles(who))[0]!.last_catch_up_on).toBe("2026-10-31");
	});

	test("takes yesterday east of UTC too, where the date is already ahead", async () => {
		const who = await newUser("profile-kiritimati");
		await post(who, {
			country: "KI",
			currency: "USD",
			timezone: "Pacific/Kiritimati",
			weekStart: "monday",
		});
		// UTC+14: 20:30 on 2 November.
		expect((await storedProfiles(who))[0]!.last_catch_up_on).toBe("2026-11-01");
	});

	// AC-F02-06
	test("refuses a time zone outside the country with 422 on timezone, and stores nothing", async () => {
		const who = await newUser("profile-wrong-zone");
		const answer = await post(who, { ...INDIA, timezone: "Asia/Dubai" });
		expect(answer.status).toBe(422);
		expect(answer.body).toMatchObject({
			error: {
				code: "validation_failed",
				fields: { timezone: PROFILE_MESSAGES.timezoneInCountry },
			},
		});
		expect(await storedProfiles(who)).toEqual([]);
	});

	test("refuses an empty body with every field's message", async () => {
		const who = await newUser("profile-empty");
		const answer = await post(who, {});
		expect(answer.status).toBe(422);
		expect(answer.body).toMatchObject({
			error: {
				code: "validation_failed",
				fields: {
					country: PROFILE_MESSAGES.countryRequired,
					currency: PROFILE_MESSAGES.currency,
					timezone: PROFILE_MESSAGES.timezoneInCountry,
					weekStart: PROFILE_MESSAGES.weekStart,
				},
			},
		});
	});

	test("refuses a field Daybook sets, such as lastCatchUpOn", async () => {
		const who = await newUser("profile-extra");
		const answer = await post(who, { ...INDIA, lastCatchUpOn: "2020-01-01" });
		expect(answer.status).toBe(422);
		expect(answer.body).toMatchObject({
			error: { fields: { lastCatchUpOn: "Remove this field." } },
		});
		expect(await storedProfiles(who)).toEqual([]);
	});

	// AC-F02-06, BR-F02-09
	test("a second create with a new key answers 200 with the profile, unchanged", async () => {
		const who = await newUser("profile-second");
		await post(who, INDIA);
		const before = await storedProfiles(who);
		vi.setSystemTime(new Date("2026-11-02T08:00:00.000Z"));
		const answer = await post(who, {
			country: "US",
			currency: "USD",
			timezone: "America/New_York",
			weekStart: "monday",
		});
		expect(answer.status).toBe(200);
		expect(answer.body).toEqual({
			data: { profile: INDIA_BLOCK, version: 1, currencyEditable: true },
		});
		expect(await storedProfiles(who)).toEqual(before);
	});

	// AC-F02-06, BR-F02-09
	test("two creates at the same moment: one 201, one 200 and exactly one profile", async () => {
		const who = await newUser("profile-race");
		const answers = await Promise.all([
			post(who, INDIA),
			post(who, { ...INDIA, weekStart: "monday" }),
		]);
		expect(answers.map((answer) => answer.status).sort()).toEqual([200, 201]);
		const rows = await storedProfiles(who);
		expect(rows).toHaveLength(1);
		// Both answer the profile that won.
		const [first, second] = answers.map(
			(answer) =>
				(answer.body as { data: { profile: { weekStart: string } } }).data,
		);
		expect(first).toEqual(second);
		expect(first!.profile.weekStart).toBe(rows[0]!.week_start);
	});

	test("an existing profile with Transactions answers 200 with its own version and a fixed currency", async () => {
		const who = await goldenUser("profile-golden-post");
		await owner.query(`UPDATE app.profile SET version = 3 WHERE user_id = $1`, [
			who.id,
		]);
		const answer = await post(who, INDIA);
		expect(answer.status).toBe(200);
		expect(answer.body).toEqual({
			data: {
				profile: { ...INDIA_BLOCK, weekStart: "monday" },
				version: 3,
				currencyEditable: false,
			},
		});
	});

	test("another user's profile never answers or blocks a create", async () => {
		await goldenUser("profile-neighbour");
		const who = await newUser("profile-own");
		const answer = await post(who, { ...INDIA, currency: "USD" });
		expect(answer.status).toBe(201);
		expect(
			(answer.body as { data: { profile: { currency: string } } }).data.profile
				.currency,
		).toBe("USD");
	});

	test("runs no catch-up itself; the next request with catch-up raises lastCatchUpOn to today", async () => {
		const who = await newUser("profile-catch-up");
		await post(who, INDIA);
		await read(who);
		expect((await storedProfiles(who))[0]!.last_catch_up_on).toBe("2026-11-01");
		const list = await call(listTransactions, "/api/transactions", {
			cookie: who.cookie,
		});
		expect(list.status).toBe(200);
		const [row] = await storedProfiles(who);
		expect(row!.last_catch_up_on).toBe("2026-11-02");
		// The catch-up update never bumps the version (BR-P2-14).
		expect(row!.version).toBe(1);
	});

	describe("idempotency (BR-P2-18)", () => {
		test("the same key and body twice give one profile and the same 201 answer", async () => {
			const who = await newUser("profile-replay");
			const key = randomUUIDv7();
			const first = await post(who, INDIA, { "idempotency-key": key });
			const second = await post(who, INDIA, { "idempotency-key": key });
			expect(first.status).toBe(201);
			expect(second.status).toBe(201);
			expect(second.body).toEqual(first.body);
			expect(await storedProfiles(who)).toHaveLength(1);
		});

		test("the same key with another body is 422 idempotency_key_reused", async () => {
			const who = await newUser("profile-key-reused");
			const key = randomUUIDv7();
			await post(who, INDIA, { "idempotency-key": key });
			const answer = await post(
				who,
				{ ...INDIA, weekStart: "monday" },
				{ "idempotency-key": key },
			);
			expect(answer.status).toBe(422);
			expect(answer.body).toMatchObject({
				error: { code: "idempotency_key_reused" },
			});
		});

		test("a missing key is 400 bad_request, and stores nothing", async () => {
			const who = await newUser("profile-no-key");
			const answer = await post(who, INDIA, { "idempotency-key": null });
			expect(answer.status).toBe(400);
			expect(answer.body).toMatchObject({ error: { code: "bad_request" } });
			expect(await storedProfiles(who)).toEqual([]);
		});

		test("the same key sent twice at the same moment gives one profile and two equal 201 answers", async () => {
			const who = await newUser("profile-same-key-race");
			const key = randomUUIDv7();
			const answers = await Promise.all([
				post(who, INDIA, { "idempotency-key": key }),
				post(who, INDIA, { "idempotency-key": key }),
			]);
			expect(answers.map((answer) => answer.status)).toEqual([201, 201]);
			expect(answers[1]!.body).toEqual(answers[0]!.body);
			expect(await storedProfiles(who)).toHaveLength(1);
		});

		test("a replay answers what was stored, even after the profile changed", async () => {
			const who = await newUser("profile-replay-later");
			const key = randomUUIDv7();
			const first = await post(who, INDIA, { "idempotency-key": key });
			await owner.query(
				`UPDATE app.profile SET week_start = 'monday', version = 2 WHERE user_id = $1`,
				[who.id],
			);
			const replay = await post(who, INDIA, { "idempotency-key": key });
			expect(replay.status).toBe(201);
			expect(replay.body).toEqual(first.body);
		});

		test("a key that is not a UUIDv7 is 400 bad_request", async () => {
			const who = await newUser("profile-bad-key");
			const answer = await post(who, INDIA, {
				"idempotency-key": "00000000-0000-4000-8000-000000000000",
			});
			expect(answer.status).toBe(400);
		});
	});

	describe("the wrapper's refusals", () => {
		test("no session is 401 unauthenticated", async () => {
			const answer = await post(null, INDIA);
			expect(answer.status).toBe(401);
			expect(answer.body).toMatchObject({
				error: { code: "unauthenticated" },
			});
		});

		test("another origin is 403 cross_origin, and stores nothing", async () => {
			const who = await newUser("profile-origin");
			const answer = await post(who, INDIA, {
				origin: "https://evil.example",
			});
			expect(answer.status).toBe(403);
			expect(answer.body).toMatchObject({ error: { code: "cross_origin" } });
			expect(await storedProfiles(who)).toEqual([]);
		});

		test("a body that is not JSON is 415 unsupported_media_type", async () => {
			const who = await newUser("profile-media");
			const answer = await post(who, INDIA, { "content-type": "text/plain" });
			expect(answer.status).toBe(415);
		});

		test("malformed JSON is 400 bad_request", async () => {
			const who = await newUser("profile-malformed");
			const answer = await call(POST, "/api/profile", {
				method: "POST",
				cookie: who.cookie,
				rawBody: "{ country:",
			});
			expect(answer.status).toBe(400);
			expect(await storedProfiles(who)).toEqual([]);
		});

		test("a Daybook-Build from another build is 409 build_mismatch", async () => {
			const who = await newUser("profile-build");
			const answer = await post(who, INDIA, {
				"daybook-build": "not-this-build",
			});
			expect(answer.status).toBe(409);
			expect(answer.body).toMatchObject({
				error: {
					code: "build_mismatch",
					details: { buildId: serverEnv().BUILD_ID },
				},
			});
		});

		test("a forged session cookie is 401 unauthenticated", async () => {
			const answer = await call(POST, "/api/profile", {
				method: "POST",
				cookie: "daybook.session_token=forged.signature",
				body: INDIA,
			});
			expect(answer.status).toBe(401);
		});

		test("a body over 64 KB is 413 payload_too_large, and stores nothing", async () => {
			const who = await newUser("profile-large");
			const answer = await post(who, {
				...INDIA,
				padding: "x".repeat(65 * 1024),
			});
			expect(answer.status).toBe(413);
			expect(await storedProfiles(who)).toEqual([]);
		});

		test("sets no cookie (BR-P2-12)", async () => {
			const who = await newUser("profile-cookie");
			const answer = await post(who, INDIA);
			expect(answer.headers.getSetCookie()).toEqual([]);
		});
	});
});

describe("GET /api/profile (BR-F02-26)", () => {
	// AC-F02-07
	test("before onboarding is 404 not_found", async () => {
		const who = await newUser("profile-get-none");
		const answer = await read(who);
		expect(answer.status).toBe(404);
		expect(answer.body).toMatchObject({ error: { code: "not_found" } });
	});

	test("the golden profile: its block, its version and a fixed currency (27 Transactions)", async () => {
		const who = await goldenUser("profile-get-golden");
		const answer = await read(who);
		expect(answer.status).toBe(200);
		expect(answer.body).toEqual({
			data: {
				profile: {
					country: "IN",
					currency: "INR",
					timezone: "Asia/Kolkata",
					weekStart: "monday",
					numberLocale: "hi-IN-u-nu-latn",
					dateLocale: "en-IN",
				},
				version: 1,
				currencyEditable: false,
			},
		});
	});

	test("answers exactly what the create answered (D-506)", async () => {
		const who = await newUser("profile-get-after-post");
		const created = await post(who, INDIA);
		expect((await read(who)).body).toEqual(created.body);
	});

	test("a forged session cookie is 401 unauthenticated", async () => {
		const answer = await call(GET, "/api/profile", {
			cookie: "daybook.session_token=forged.signature",
		});
		expect(answer.status).toBe(401);
	});

	test("answers the stored version", async () => {
		const who = await goldenUser("profile-get-version");
		await owner.query(`UPDATE app.profile SET version = 3 WHERE user_id = $1`, [
			who.id,
		]);
		expect(
			((await read(who)).body as { data: { version: number } }).data.version,
		).toBe(3);
	});

	test("the currency is editable again once the last Transaction is gone (BR-F02-14)", async () => {
		const who = await goldenUser("profile-get-emptied");
		await owner.query(`DELETE FROM app.transactions WHERE user_id = $1`, [
			who.id,
		]);
		expect(
			((await read(who)).body as { data: { currencyEditable: boolean } }).data
				.currencyEditable,
		).toBe(true);
	});

	test("one Transaction fixes the currency", async () => {
		const who = await goldenUser("profile-get-one");
		await owner.query(
			`DELETE FROM app.transactions WHERE user_id = $1
			   AND id <> (SELECT min(id::text)::uuid FROM app.transactions WHERE user_id = $1)`,
			[who.id],
		);
		const { rows } = await owner.query(
			`SELECT count(*)::int AS n FROM app.transactions WHERE user_id = $1`,
			[who.id],
		);
		expect(rows[0].n).toBe(1);
		expect(
			((await read(who)).body as { data: { currencyEditable: boolean } }).data
				.currencyEditable,
		).toBe(false);
	});

	test("counts only the user's own Transactions", async () => {
		await goldenUser("profile-get-rich-neighbour");
		const who = await newUser("profile-get-own");
		await post(who, INDIA);
		const answer = await read(who);
		expect(
			(answer.body as { data: { currencyEditable: boolean } }).data
				.currencyEditable,
		).toBe(true);
	});

	test("never shows another user's profile", async () => {
		await goldenUser("profile-get-other");
		const who = await newUser("profile-get-mine");
		expect((await read(who)).status).toBe(404);
	});

	test("no session is 401 unauthenticated", async () => {
		const answer = await read(null);
		expect(answer.status).toBe(401);
		expect(answer.body).toMatchObject({ error: { code: "unauthenticated" } });
	});

	test("runs no catch-up", async () => {
		const who = await goldenUser("profile-get-no-catch-up");
		await owner.query(
			`UPDATE app.profile SET last_catch_up_on = '2026-10-30' WHERE user_id = $1`,
			[who.id],
		);
		await read(who);
		expect((await storedProfiles(who))[0]!.last_catch_up_on).toBe("2026-10-30");
	});
});

// AC-F02-07
test("before onboarding, a route that needs a profile is 403 profile_required", async () => {
	const who = await newUser("profile-required");
	const answer = await call(listTransactions, "/api/transactions", {
		cookie: who.cookie,
	});
	expect(answer.status).toBe(403);
	expect(answer.body).toMatchObject({ error: { code: "profile_required" } });
});
