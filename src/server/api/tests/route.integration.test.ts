import { randomUUIDv7 } from "node:crypto";
import { eq } from "drizzle-orm";
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
import { z } from "zod";
import { sessionFor, signedInUser } from "../../auth/tests/sessions";
import { resetCatchUpNote } from "../../dal/catch-up";
import { versionedUpdate } from "../../dal/versions";
import { profile } from "../../db/schema";
import { GOLDEN_NOW, insertRow, PRIVATE_ROWS } from "../../db/tests/private-rows";
import { parseOwnerEnv, serverEnv } from "../../env";
import { ApiError } from "../errors";
import { reply, route } from "../route";

const ORIGIN = serverEnv().APP_ORIGIN;
const BUILD = serverEnv().BUILD_ID;

let owner: Client;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(async () => {
	await owner.query(`DELETE FROM auth."user" WHERE id = ANY($1::uuid[])`, [users]);
	await owner.end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
	// No note reset here: every test makes new users, who have no note yet, so the daily pass
	// runs once per file instead of once per test. Tests about the notes reset them themselves.
});

afterEach(() => {
	vi.useRealTimers();
});

/** A new signed-in user, with a profile unless `withProfile` is false. */
async function newUser(withProfile = true): Promise<{ id: string; cookie: string }> {
	const user = await signedInUser(owner, "route");
	users.push(user.id);
	if (withProfile)
		await insertRow(owner, "profile", PRIVATE_ROWS.profile(user.id));
	return user;
}

async function profileOf(userId: string) {
	const { rows } = await owner.query(
		"SELECT id, country, version, updated_at FROM app.profile WHERE user_id = $1",
		[userId],
	);
	return rows[0] as
		| { id: string; country: string; version: number; updated_at: Date }
		| undefined;
}

type Init = {
	method?: string;
	cookie?: string;
	body?: unknown;
	rawBody?: string;
	headers?: Record<string, string | null>;
};

/** A request as the app's client sends it: JSON, same origin, a fresh idempotency key. */
function request(
	path: string,
	{ method = "GET", cookie, body, rawBody, headers = {} }: Init = {},
) {
	const mutation = method !== "GET";
	const base: Record<string, string | null> = {
		...(mutation ?
			{
				"content-type": "application/json",
				origin: ORIGIN,
				"idempotency-key": randomUUIDv7(),
			}
		:	{}),
		...(cookie ? { cookie } : {}),
		...headers,
	};
	const finalHeaders = Object.fromEntries(
		Object.entries(base).filter(
			(entry): entry is [string, string] => entry[1] !== null,
		),
	);
	return new Request(`${ORIGIN}${path}`, {
		method,
		headers: finalHeaders,
		...(mutation ? { body: rawBody ?? JSON.stringify(body ?? {}) } : {}),
	});
}

// --- Test-only routes over the profile table ------------------------------------------

let createRuns = 0;

const createProfile = route(
	{
		profile: false,
		body: z.object({
			country: z.string().regex(/^[A-Z]{2}$/),
			timezone: z.string(),
		}),
	},
	async (ctx, tx, { body }) => {
		createRuns += 1;
		const [row] = await tx
			.insert(profile)
			.values({
				id: randomUUIDv7(),
				userId: ctx.user.id,
				country: body.country,
				currency: "INR",
				timezone: body.timezone,
				weekStart: "monday",
				lastCatchUpOn: "2026-11-01",
				createdAt: ctx.now,
				updatedAt: ctx.now,
			})
			.returning({
				id: profile.id,
				country: profile.country,
				version: profile.version,
			});
		return reply(row, { status: 201 });
	},
);

const readContext = route({}, async (ctx) => ({
	profile: ctx.profile,
	today: ctx.today,
	pricesUpdated: ctx.pricesUpdated,
	user: ctx.user,
}));

const readNoProfile = route({ profile: false }, async (ctx) => ({
	profile: ctx.profile,
}));

const patchCountry = route(
	{ versioned: true, body: z.object({ country: z.string().regex(/^[A-Z]{2}$/) }) },
	async (ctx, tx, { body, params, version }) => {
		const row = await versionedUpdate(
			tx,
			profile,
			{ id: String(params["id"]), version: version! },
			{ country: body.country },
			ctx.now,
		);
		return { id: row.id, country: row.country, version: row.version };
	},
);

const deleteNothing = route({}, async () => reply(null, { status: 204 }));

const failing = route({}, async () => {
	throw new ApiError("has_dependents");
});

const crashing = route({}, async () => {
	throw new Error("something private: asha@example.com");
});

const echo = route(
	{ idempotent: false, profile: false },
	async (_ctx, _tx, input) => ({
		body: input.body,
		query: Object.fromEntries(input.query),
		params: input.params,
	}),
);

const params = (value: Record<string, string>) => ({
	params: Promise.resolve(value),
});

// --- Tests ------------------------------------------------------------------------------

describe("every answer", () => {
	test("is { data } with x-request-id and Server-Timing (root API-8, API-11)", async () => {
		const user = await newUser();
		const response = await readContext(
			request("/api/test", { cookie: user.cookie }),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(Object.keys(body)).toEqual(["data"]);
		expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
		expect(response.headers.get("server-timing")).toMatch(
			/^db;dur=\d+, app;dur=\d+$/,
		);
	});

	test("an error is the envelope with the same request id in body and header", async () => {
		const response = await readContext(request("/api/test"));
		const { error } = await response.json();
		expect(error.requestId).toBe(response.headers.get("x-request-id"));
	});

	test("keeps the proxy's request id", async () => {
		const id = randomUUIDv7();
		const response = await readContext(
			request("/api/test", { headers: { "x-request-id": id } }),
		);
		expect(response.headers.get("x-request-id")).toBe(id);
	});

	test("counts database time in Server-Timing", async () => {
		const user = await newUser();
		const response = await readContext(
			request("/api/test", { cookie: user.cookie }),
		);
		const db = Number(
			/db;dur=(\d+)/.exec(response.headers.get("server-timing")!)![1],
		);
		// Several round trips to the database's region; never zero.
		expect(db).toBeGreaterThan(0);
	});
});

describe("the daily pass (BR-P2-27)", () => {
	// Its purge deletes records 90 days older than the day, so the day stays close to the golden
	// clock: files running alongside keep their records. The marker is cleared around the test.
	const DAY = "2026-12-01";

	beforeAll(async () => {
		await owner.query("DELETE FROM app.daily_pass_markers WHERE day = $1", [
			DAY,
		]);
	});

	afterAll(async () => {
		await owner.query("DELETE FROM app.daily_pass_markers WHERE day = $1", [
			DAY,
		]);
	});

	test("the first request of a new UTC day runs it", async () => {
		const user = await newUser();
		resetCatchUpNote();
		vi.setSystemTime(new Date(`${DAY}T09:00:00.000Z`));
		expect(
			(await readContext(request("/api/test", { cookie: user.cookie })))
				.status,
		).toBe(200);
		const { rows } = await owner.query(
			"SELECT 1 FROM app.daily_pass_markers WHERE day = $1",
			[DAY],
		);
		expect(rows).toHaveLength(1);
	});
});

describe("the request context", () => {
	test("holds the user, the profile, today in the profile's zone and pricesUpdated", async () => {
		const user = await newUser();
		const { data } = await (
			await readContext(request("/api/test", { cookie: user.cookie }))
		).json();
		expect(data.user.id).toBe(user.id);
		expect(data.profile).toMatchObject({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "monday",
		});
		expect(data.today).toBe("2026-11-02");
		expect(data.pricesUpdated).toBe(false);
	});
});

describe("refusals, in step order (BR-P2-17)", () => {
	// AC-P2-29
	test("no session gives 401 unauthenticated", async () => {
		const response = await readContext(request("/api/test"));
		expect(response.status).toBe(401);
		expect((await response.json()).error.code).toBe("unauthenticated");
	});

	test("a session for a deleted user gives 401", async () => {
		const user = await newUser(false);
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [user.id]);
		const response = await readContext(
			request("/api/test", { cookie: user.cookie }),
		);
		expect(response.status).toBe(401);
	});

	test("a user without a profile gets 403 profile_required", async () => {
		const user = await newUser(false);
		const response = await readContext(
			request("/api/test", { cookie: user.cookie }),
		);
		expect(response.status).toBe(403);
		expect((await response.json()).error.code).toBe("profile_required");
	});

	test("a route that opts out works without a profile", async () => {
		const user = await newUser(false);
		const response = await readNoProfile(
			request("/api/test", { cookie: user.cookie }),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).data.profile).toBeNull();
	});

	// AC-P2-10, AC-P2-29
	test.each([
		[
			"a foreign Origin",
			{ origin: "https://evil.example" },
			403,
			"cross_origin",
		],
		["no Origin", { origin: null }, 403, "cross_origin"],
		[
			"text/plain",
			{ "content-type": "text/plain" },
			415,
			"unsupported_media_type",
		],
		["no Content-Type", { "content-type": null }, 415, "unsupported_media_type"],
	])("a mutation with %s gives %i", async (_name, headers, status, code) => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "IN", timezone: "Asia/Kolkata" },
				headers,
			}),
		);
		expect(response.status).toBe(status);
		expect((await response.json()).error.code).toBe(code);
		expect(await profileOf(user.id)).toBeUndefined();
	});

	// AC-P2-29: refused before the session is even looked at.
	test.each([
		["a foreign Origin", { origin: "https://evil.example" }, 403],
		["text/plain", { "content-type": "text/plain" }, 415],
	])(
		"with no session cookie, %s still gives %i",
		async (_name, headers, status) => {
			const response = await createProfile(
				request("/api/test", { method: "POST", body: {}, headers }),
			);
			expect(response.status).toBe(status);
		},
	);

	// AC-P2-10
	test("application/json; charset=utf-8 passes", async () => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "IN", timezone: "Asia/Kolkata" },
				headers: { "content-type": "application/json; charset=utf-8" },
			}),
		);
		expect(response.status).toBe(201);
	});

	test("a body over 64 KB gives 413", async () => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				rawBody: JSON.stringify({ pad: "a".repeat(64 * 1024) }),
			}),
		);
		expect(response.status).toBe(413);
	});

	test.each([
		["missing", null],
		["not a UUIDv7", "0192f0c4-8a1b-4c2d-9e3f-0123456789ab"],
	])("an Idempotency-Key that is %s gives 400", async (_name, key) => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "IN", timezone: "Asia/Kolkata" },
				headers: { "idempotency-key": key },
			}),
		);
		expect(response.status).toBe(400);
		expect((await response.json()).error.code).toBe("bad_request");
	});

	test("a route exempt from idempotency needs no key", async () => {
		const user = await newUser(false);
		const response = await echo(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { a: 1 },
				headers: { "idempotency-key": null },
			}),
		);
		expect(response.status).toBe(200);
	});

	test("a Daybook-Build from another build gives 409 build_mismatch, before any write", async () => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "IN", timezone: "Asia/Kolkata" },
				headers: { "daybook-build": `${BUILD}-old` },
			}),
		);
		expect(response.status).toBe(409);
		const { error } = await response.json();
		expect(error.code).toBe("build_mismatch");
		expect(error.details).toEqual({ buildId: BUILD });
		expect(await profileOf(user.id)).toBeUndefined();
	});

	test("the matching Daybook-Build passes", async () => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "IN", timezone: "Asia/Kolkata" },
				headers: { "daybook-build": BUILD },
			}),
		);
		expect(response.status).toBe(201);
	});

	test("a versioned route without If-Match gives 400", async () => {
		const user = await newUser();
		const row = await profileOf(user.id);
		const response = await patchCountry(
			request(`/api/test/${row!.id}`, {
				method: "PATCH",
				cookie: user.cookie,
				body: { country: "US" },
			}),
			params({ id: row!.id }),
		);
		expect(response.status).toBe(400);
	});

	test("malformed JSON gives 400 and stores nothing", async () => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				rawBody: "{not json",
			}),
		);
		expect(response.status).toBe(400);
		const { rows } = await owner.query(
			"SELECT 1 FROM app.idempotency_records WHERE user_id = $1",
			[user.id],
		);
		expect(rows).toHaveLength(0);
	});

	test("an invalid body gives 422 with one message per field", async () => {
		const user = await newUser(false);
		const response = await createProfile(
			request("/api/test", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "india" },
			}),
		);
		expect(response.status).toBe(422);
		const { error } = await response.json();
		expect(error.code).toBe("validation_failed");
		expect(Object.keys(error.fields).sort()).toEqual(["country", "timezone"]);
	});
});

describe("idempotency (BR-P2-18, BR-P2-19)", () => {
	const create = (
		cookie: string,
		key: string,
		body: unknown = { country: "IN", timezone: "Asia/Kolkata" },
	) =>
		createProfile(
			request("/api/test?source=queue", {
				method: "POST",
				cookie,
				body,
				headers: { "idempotency-key": key },
			}),
		);

	// AC-P2-08
	test("two identical POSTs in a row make one row and identical answers", async () => {
		const user = await newUser(false);
		const key = randomUUIDv7();
		createRuns = 0;
		const first = await create(user.cookie, key);
		const second = await create(user.cookie, key);
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		expect(await second.text()).toBe(await first.text());
		expect(createRuns).toBe(1);
		const { rows } = await owner.query(
			"SELECT 1 FROM app.profile WHERE user_id = $1",
			[user.id],
		);
		expect(rows).toHaveLength(1);
	});

	// AC-P2-08
	test("two identical POSTs at once make one row and identical answers", async () => {
		const user = await newUser(false);
		const key = randomUUIDv7();
		createRuns = 0;
		const [a, b] = await Promise.all([
			create(user.cookie, key),
			create(user.cookie, key),
		]);
		expect([a.status, b.status]).toEqual([201, 201]);
		expect(await a.text()).toBe(await b.text());
		expect(createRuns).toBe(1);
	});

	// AC-P2-08
	test("the same key with a different body gives 422 idempotency_key_reused", async () => {
		const user = await newUser(false);
		const key = randomUUIDv7();
		await create(user.cookie, key);
		const response = await create(user.cookie, key, {
			country: "US",
			timezone: "UTC",
		});
		expect(response.status).toBe(422);
		expect((await response.json()).error.code).toBe("idempotency_key_reused");
	});

	test("the same body with its keys in another order is the same request", async () => {
		const user = await newUser(false);
		const key = randomUUIDv7();
		const first = await create(user.cookie, key, {
			country: "IN",
			timezone: "Asia/Kolkata",
		});
		const second = await create(user.cookie, key, {
			timezone: "Asia/Kolkata",
			country: "IN",
		});
		expect(await second.text()).toBe(await first.text());
	});

	test("the same key on another path or query gives 422 (D-432)", async () => {
		const user = await newUser(false);
		const key = randomUUIDv7();
		await create(user.cookie, key);
		const response = await createProfile(
			request("/api/test?source=other", {
				method: "POST",
				cookie: user.cookie,
				body: { country: "IN", timezone: "Asia/Kolkata" },
				headers: { "idempotency-key": key },
			}),
		);
		expect(response.status).toBe(422);
	});

	test("a replay is answered before later checks, even ones that would now refuse it", async () => {
		const user = await newUser();
		const key = randomUUIDv7();
		const send = () =>
			deleteNothing(
				request("/api/test", {
					method: "DELETE",
					cookie: user.cookie,
					headers: { "idempotency-key": key },
				}),
			);
		expect((await send()).status).toBe(204);
		// Without a profile, this route now refuses with 403; the stored answer still comes back.
		await owner.query("DELETE FROM app.profile WHERE user_id = $1", [user.id]);
		expect((await send()).status).toBe(204);
		const fresh = await deleteNothing(
			request("/api/test", { method: "DELETE", cookie: user.cookie }),
		);
		expect(fresh.status).toBe(403);
	});

	test("keys are per user: another user's same key runs normally", async () => {
		const a = await newUser(false);
		const b = await newUser(false);
		const key = randomUUIDv7();
		await create(a.cookie, key);
		const response = await create(b.cookie, key, {
			country: "US",
			timezone: "UTC",
		});
		expect(response.status).toBe(201);
	});

	test("a failed handler stores nothing, so a retry with the same key runs again", async () => {
		const user = await newUser();
		const key = randomUUIDv7();
		const send = () =>
			failing(
				request("/api/test", {
					method: "POST",
					cookie: user.cookie,
					headers: { "idempotency-key": key },
				}),
			);
		expect((await send()).status).toBe(409);
		const { rows } = await owner.query(
			"SELECT 1 FROM app.idempotency_records WHERE user_id = $1",
			[user.id],
		);
		expect(rows).toHaveLength(0);
		expect((await send()).status).toBe(409);
	});

	test("stores the status and the whole body with the record", async () => {
		const user = await newUser(false);
		const key = randomUUIDv7();
		const response = await create(user.cookie, key);
		const { rows } = await owner.query(
			"SELECT status_code, response_body FROM app.idempotency_records WHERE user_id = $1 AND key = $2",
			[user.id, key],
		);
		expect(rows[0].status_code).toBe(201);
		expect(rows[0].response_body).toEqual(await response.json());
	});

	test("a 204 is stored with no body and replayed with none", async () => {
		const user = await newUser();
		const key = randomUUIDv7();
		const send = () =>
			deleteNothing(
				request("/api/test", {
					method: "DELETE",
					cookie: user.cookie,
					headers: { "idempotency-key": key },
				}),
			);
		const first = await send();
		const second = await send();
		expect([first.status, second.status]).toEqual([204, 204]);
		expect(await second.text()).toBe("");
	});
});

describe("versions (BR-P2-21)", () => {
	const patch = (cookie: string, id: string, version: string, country = "US") =>
		patchCountry(
			request(`/api/test/${id}`, {
				method: "PATCH",
				cookie,
				body: { country },
				headers: { "if-match": version },
			}),
			params({ id }),
		);

	test("a PATCH with the current version updates and raises it", async () => {
		const user = await newUser();
		const row = await profileOf(user.id);
		const response = await patch(user.cookie, row!.id, '"1"');
		expect(response.status).toBe(200);
		expect((await response.json()).data).toEqual({
			id: row!.id,
			country: "US",
			version: 2,
		});
		const after = await profileOf(user.id);
		expect(after!.version).toBe(2);
		expect(after!.updated_at.toISOString()).toBe(GOLDEN_NOW);
	});

	// AC-P2-09
	test("a PATCH with a stale If-Match gives 409 with the current row", async () => {
		const user = await newUser();
		const row = await profileOf(user.id);
		await patch(user.cookie, row!.id, '"1"', "US");
		const response = await patch(user.cookie, row!.id, '"1"', "GB");
		expect(response.status).toBe(409);
		const { error } = await response.json();
		expect(error.code).toBe("version_conflict");
		expect(error.details.current).toMatchObject({
			id: row!.id,
			country: "US",
			version: 2,
		});
		expect((await profileOf(user.id))!.country).toBe("US");
	});

	// AC-P2-09
	test("a PATCH on another user's id gives 404", async () => {
		const a = await newUser();
		const b = await newUser();
		const theirs = await profileOf(b.id);
		const response = await patch(a.cookie, theirs!.id, '"1"');
		expect(response.status).toBe(404);
		expect((await response.json()).error.code).toBe("not_found");
		expect((await profileOf(b.id))!.country).toBe("IN");
	});
});

describe("errors", () => {
	test("an unexpected error gives 500 internal and logs only safe facts", async () => {
		const user = await newUser();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await crashing(
				request("/api/test", {
					method: "POST",
					cookie: user.cookie,
					body: {},
				}),
			);
			expect(response.status).toBe(500);
			const body = await response.json();
			expect(body.error.code).toBe("internal");
			expect(JSON.stringify(body)).not.toContain("asha@example.com");
			const calls = error.mock.calls;
			expect(calls).toEqual([
				[
					"[api] Request failed",
					{
						requestId: body.error.requestId,
						code: "internal",
						name: "Error",
					},
				],
			]);
		} finally {
			error.mockRestore();
		}
	});

	test("a read's internal error says it could not be loaded", async () => {
		const user = await newUser();
		const broken = route({}, async () => {
			throw new Error("x");
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await broken(
				request("/api/test", { cookie: user.cookie }),
			);
			expect((await response.json()).error.message).toBe(
				"This could not be loaded.",
			);
		} finally {
			error.mockRestore();
		}
	});

	test("a read cannot write: the transaction is read only", async () => {
		const user = await newUser();
		const writing = route({}, async (ctx, tx) => {
			await tx
				.update(profile)
				.set({ country: "US" })
				.where(eq(profile.userId, ctx.user.id));
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await writing(
				request("/api/test", { cookie: user.cookie }),
			);
			expect(response.status).toBe(500);
			expect((await profileOf(user.id))!.country).toBe("IN");
		} finally {
			error.mockRestore();
		}
	});

	test("a write RLS refuses gives 404 and is logged as a security event", async () => {
		const a = await newUser();
		const b = await newUser(false);
		const intruding = route({}, async (ctx, tx) => {
			await tx.insert(profile).values({
				id: randomUUIDv7(),
				userId: b.id,
				country: "IN",
				currency: "INR",
				timezone: "UTC",
				weekStart: "monday",
				lastCatchUpOn: "2026-11-01",
				createdAt: ctx.now,
				updatedAt: ctx.now,
			});
		});
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const response = await intruding(
				request("/api/test", { method: "POST", cookie: a.cookie, body: {} }),
			);
			expect(response.status).toBe(404);
			expect(error.mock.calls[0]?.[0]).toBe("[api] Security event");
			expect(await profileOf(b.id)).toBeUndefined();
		} finally {
			error.mockRestore();
		}
	});
});

describe("input", () => {
	test("passes the parsed body, the query and the route params", async () => {
		const user = await newUser(false);
		const response = await echo(
			request("/api/test/x?limit=5&tag=a&tag=b", {
				method: "POST",
				cookie: user.cookie,
				body: { a: [1, 2] },
			}),
			params({ id: "x" }),
		);
		expect((await response.json()).data).toEqual({
			body: { a: [1, 2] },
			query: { limit: "5", tag: "b" },
			params: { id: "x" },
		});
	});

	test("a second session for the same user works the same", async () => {
		const user = await newUser();
		const cookie = await sessionFor(owner, user.id);
		const response = await readContext(request("/api/test", { cookie }));
		expect(response.status).toBe(200);
	});
});
