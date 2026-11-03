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
import { call } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { REGISTRY } from "@/server/capabilities/registry";
import { runtimePool } from "@/server/db/pools";
import { NO_PLAN } from "@/server/dal/me";
import { parseOwnerEnv, serverEnv } from "@/server/env";
import { GET } from "../route";

/** `GET /api/me` (BR-F02-25, BR-P4-11, D-505, D-506) through the route wrapper, real sessions
 * and the golden clock. */

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

async function goldenUser(label: string): Promise<User> {
	const signedIn = await newUser(label);
	await loadGolden(owner, signedIn.id);
	return signedIn;
}

const me = (who: User | null) =>
	call(GET, "/api/me", who ? { cookie: who.cookie } : {});

async function emailOf(who: User): Promise<string> {
	const { rows } = await owner.query<{ email: string }>(
		`SELECT email FROM auth."user" WHERE id = $1`,
		[who.id],
	);
	return rows[0]!.email;
}

/** What a Free user with no switches sees (D-505): premium codes refused, the Free limit, the
 * two client flags on. */
const FREE_CAPABILITIES = {
	"goals.active.max": { allowed: true, reason: "ok", limit: 3 },
	"analytics.heatmap.view": { allowed: false, reason: "premium_required" },
	"analytics.comparative.view": { allowed: false, reason: "premium_required" },
	"reports.quarterly.generate": { allowed: false, reason: "premium_required" },
	"reports.annual.generate": { allowed: false, reason: "premium_required" },
	"offline.writes": { allowed: true, reason: "ok" },
	"sync.background": { allowed: true, reason: "ok" },
};

describe("GET /api/me", () => {
	// AC-F02-07
	test("before onboarding: the user, profile and goals null, the no-plan block and Free capabilities", async () => {
		const who = await newUser("me-new");
		const answer = await me(who);
		expect(answer.status).toBe(200);
		expect(answer.body).toEqual({
			data: {
				user: { id: who.id, email: await emailOf(who), name: "me-new" },
				profile: null,
				plan: NO_PLAN,
				goals: null,
				capabilities: FREE_CAPABILITIES,
				resolvedAt: GOLDEN_NOW,
				buildId: serverEnv().BUILD_ID,
			},
		});
	});

	test("after onboarding: the profile block with both locales, and the Goals lock summary", async () => {
		const who = await goldenUser("me-golden");
		const { data } = (await me(who)).body as { data: Record<string, unknown> };
		expect(data["profile"]).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "monday",
			numberLocale: "hi-IN-u-nu-latn",
			dateLocale: "en-IN",
		});
		expect(data["goals"]).toEqual({ lockedCount: 0, needsChoice: false });
		expect(data["plan"]).toEqual(NO_PLAN);
		expect(data["capabilities"]).toEqual(FREE_CAPABILITIES);
	});

	test("F12's no-plan block: not Premium, status none, every other field null, not a duplicate", () => {
		expect(NO_PLAN).toEqual({
			premium: false,
			status: "none",
			source: null,
			hasBillingAccount: false,
			interval: null,
			price: null,
			currentPeriodEnd: null,
			endsAt: null,
			scheduledInterval: null,
			scheduledAt: null,
			endedAt: null,
			lapseSeenAt: null,
			duplicate: false,
		});
	});

	// AC-P4-07
	test("contains no capability whose clientVisible is false", async () => {
		const who = await goldenUser("me-visible");
		const { data } = (await me(who)).body as {
			data: { capabilities: Record<string, unknown> };
		};
		const hidden = Object.keys(data.capabilities).filter(
			(code) => !REGISTRY[code as keyof typeof REGISTRY].clientVisible,
		);
		expect(hidden).toEqual([]);
		expect(JSON.stringify(data)).not.toContain("insights.");
	});

	test("shows the stored profile fields as they are, and the locales of the country", async () => {
		const who = await newUser("me-us");
		await owner.query(
			`INSERT INTO app.profile (id, user_id, created_at, updated_at, country, currency, timezone,
			   week_start, last_catch_up_on, version)
			 VALUES (gen_random_uuid(), $1, $2, $2, 'DE', 'USD', 'UTC', 'saturday', '2026-11-01', 4)`,
			[who.id, GOLDEN_NOW],
		);
		const { data } = (await me(who)).body as { data: { profile: unknown } };
		expect(data.profile).toEqual({
			country: "DE",
			currency: "USD",
			timezone: "UTC",
			weekStart: "saturday",
			numberLocale: "de-DE-u-nu-latn",
			dateLocale: "en-DE",
		});
	});

	test("answers only the signed-in user, never a neighbour", async () => {
		const neighbour = await goldenUser("me-neighbour");
		const who = await newUser("me-alone");
		const { data } = (await me(who)).body as {
			data: { user: { id: string }; profile: unknown };
		};
		expect(data.user.id).toBe(who.id);
		expect(data.user.id).not.toBe(neighbour.id);
		expect(data.profile).toBeNull();
	});

	test("the user block holds only id, email and name", async () => {
		const who = await newUser("me-fields");
		const { data } = (await me(who)).body as { data: { user: object } };
		expect(Object.keys(data.user).sort()).toEqual(["email", "id", "name"]);
	});

	test("resolvedAt is the request clock", async () => {
		const who = await newUser("me-clock");
		vi.setSystemTime(new Date("2026-11-02T09:15:42.123Z"));
		const { data } = (await me(who)).body as { data: { resolvedAt: string } };
		expect(data.resolvedAt).toBe("2026-11-02T09:15:42.123Z");
	});

	test("no session is 401 unauthenticated", async () => {
		const answer = await me(null);
		expect(answer.status).toBe(401);
		expect(answer.body).toMatchObject({ error: { code: "unauthenticated" } });
	});

	test("a forged session cookie is 401 unauthenticated", async () => {
		const answer = await call(GET, "/api/me", {
			cookie: "daybook.session_token=forged.signature",
		});
		expect(answer.status).toBe(401);
	});

	test("a session whose user was deleted is 401 unauthenticated", async () => {
		const who = await newUser("me-deleted");
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [who.id]);
		expect((await me(who)).status).toBe(401);
	});

	test("runs no catch-up", async () => {
		const who = await goldenUser("me-no-catch-up");
		await owner.query(
			`UPDATE app.profile SET last_catch_up_on = '2026-10-30' WHERE user_id = $1`,
			[who.id],
		);
		await me(who);
		const { rows } = await owner.query<{ day: string }>(
			`SELECT last_catch_up_on::text AS day FROM app.profile WHERE user_id = $1`,
			[who.id],
		);
		expect(rows[0]!.day).toBe("2026-10-30");
	});

	test("sets no cookie (BR-P2-12)", async () => {
		const who = await newUser("me-cookie");
		expect((await me(who)).headers.getSetCookie()).toEqual([]);
	});
});
