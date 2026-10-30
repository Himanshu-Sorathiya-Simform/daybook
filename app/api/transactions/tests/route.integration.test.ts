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
import { loadGolden, type LoadedGolden } from "../../../../seed/load-golden";
import type { Transaction } from "@/lib/transactions/model";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import type { GroupTotal } from "@/server/dal/transactions/list";
import { GET } from "../route";

/** `GET /api/transactions` (F03 section 11) through the route wrapper, a real session and the
 * golden clock, on golden's M1 rows. */

type Page = {
	items: Transaction[];
	nextCursor: string | null;
	prevCursor: string | null;
	currency: string;
	groups: GroupTotal[];
	order: string | null;
};

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let other: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

async function goldenUser(label: string) {
	const user = await signedInUser(owner, label);
	return { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
}

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser("list-route");
	other = await goldenUser("list-route-other");
	await owner.query("UPDATE app.profile SET currency = 'USD' WHERE user_id = $1", [
		other.userId,
	]);
	noProfile = await signedInUser(owner, "list-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId, noProfile?.id].filter(Boolean),
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

const list = (query: string, cookie = golden.cookie) =>
	call(GET, `/api/transactions${query ? `?${query}` : ""}`, { cookie });

const pageOf = (body: unknown) => (body as { data: Page }).data;
const numbers = (page: Page) => page.items.map((item) => golden.golden(item.id));
const errorOf = (body: unknown) =>
	(body as { error: { code: string; details: Record<string, unknown> } }).error;

// golden: Transactions list checks, the order checks, for golden's 22 M1 rows.
const NEWEST_FIRST = [
	26, 27, 25, 24, 21, 20, 19, 18, 17, 16, 15, 13, 12, 11, 10, 8, 7, 6, 5, 4, 2, 1,
];

describe("a page", () => {
	// AC-F03-34
	test("check A, oldest first, limit 1: #12 with 1 October's whole-day totals", async () => {
		const { status, body, headers } = await list(
			"from=2026-10-01&to=2026-10-31&dir=asc&limit=1",
		);
		expect(status).toBe(200);
		const page = pageOf(body);
		expect(numbers(page)).toEqual([12]);
		expect(page.groups).toEqual([
			{
				key: "2026-10-01",
				label: null,
				count: 2,
				inMinor: 8500000,
				outMinor: 1800000,
				toGoalsMinor: 0,
			},
		]);
		expect(page).toMatchObject({
			currency: "INR",
			order: null,
			prevCursor: null,
		});
		expect(page.nextCursor).toEqual(expect.any(String));
		// API-8
		expect(headers.get("x-request-id")).toBeTruthy();
		expect(headers.get("server-timing")).toMatch(/db;dur=\d+, app;dur=\d+/);
	});

	test("defaults to newest first by day, 50 a page", async () => {
		const page = pageOf((await list("")).body);
		expect(numbers(page)).toEqual(NEWEST_FIRST);
		expect(page.nextCursor).toBeNull();
		expect(page.groups[0]).toMatchObject({ key: "2026-11-01", count: 2 });
	});

	test("follows nextCursor, 5 at a time, through every row once", async () => {
		const seen: number[] = [];
		let cursor: string | null = null;
		do {
			const query: string = `limit=5${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
			const page = pageOf((await list(query)).body);
			seen.push(...numbers(page));
			cursor = page.nextCursor;
		} while (cursor);
		expect(seen).toEqual(NEWEST_FIRST);
	});

	// AC-F03-35, through HTTP
	test("groups by category with an order fingerprint", async () => {
		const page = pageOf(
			(await list("from=2026-10-01&to=2026-10-31&group=category")).body,
		);
		expect(page.groups.map(({ key }) => key)).toEqual([
			"salary",
			"housing",
			"food",
			"shopping",
			"entertainment",
			"transportation",
		]);
		expect(page.order).toMatch(/^[0-9a-f]{16}$/);
	});

	// API-6: the answer's currency is the profile's.
	test("carries the profile's currency", async () => {
		expect(pageOf((await list("limit=1", other.cookie)).body).currency).toBe(
			"USD",
		);
	});
});

describe("refusals", () => {
	// D-457, D-478
	test("an invalid filter and limit get one 400 naming both", async () => {
		const { status, body } = await list("cat=pizza&limit=500");
		expect(status).toBe(400);
		expect(errorOf(body)).toMatchObject({
			code: "bad_request",
			details: { params: ["cat", "limit"] },
		});
	});

	// AC-F03-38
	test.each([
		["made under day grouping, sent with no grouping", "", "group=none"],
		[
			"made under the date sort, sent with the amount sort",
			"group=none",
			"sort=amount",
		],
		["made newest first, sent oldest first", "", "dir=asc"],
	])("a cursor %s gets 400 naming cursor", async (_label, made, sent) => {
		const first = pageOf((await list(`limit=1${made ? `&${made}` : ""}`)).body);
		const { status, body } = await list(
			`limit=1&${sent}&cursor=${encodeURIComponent(first.nextCursor!)}`,
		);
		expect(status).toBe(400);
		expect(errorOf(body)).toMatchObject({
			code: "bad_request",
			details: { params: ["cursor"] },
		});
	});

	test("a cursor that does not decode gets 400 naming cursor", async () => {
		const { status, body } = await list("cursor=not-a-cursor");
		expect(status).toBe(400);
		expect(errorOf(body).details).toEqual({ params: ["cursor"] });
	});

	// D-478, D-490: the cursor is read with the rest, so one round trip names everything.
	test("a cursor that does not decode is named beside the other invalid parameters", async () => {
		const { status, body } = await list("cat=pizza&cursor=not-a-cursor&limit=0");
		expect(status).toBe(400);
		expect(errorOf(body).details).toEqual({
			params: ["cat", "limit", "cursor"],
		});
	});

	/** The first page's next cursor under `query`, with `change` written into its contents. */
	async function forged(query: string, change: Record<string, unknown>) {
		const { nextCursor } = pageOf((await list(`limit=1&${query}`)).body);
		const contents = JSON.parse(
			Buffer.from(nextCursor!, "base64url").toString("utf8"),
		) as Record<string, unknown>;
		return Buffer.from(JSON.stringify({ ...contents, ...change })).toString(
			"base64url",
		);
	}

	// D-490: each of these reached Postgres, whose refusal of the cast was a 500.
	test.each([
		["an instant in the year 0000", "", { at: "0000-12-31T23:59:00.000Z" }],
		["a group key holding a NUL", "group=payee", { groupKey: "swiggy\u0000" }],
	])("a cursor with %s gets 400 naming cursor", async (_label, query, change) => {
		const cursor = await forged(query, change);
		const { status, body } = await list(`${query}&cursor=${cursor}`);
		expect(status).toBe(400);
		expect(errorOf(body)).toMatchObject({
			code: "bad_request",
			details: { params: ["cursor"] },
		});
	});

	test("no session gets 401", async () => {
		const { status, body } = await call(GET, "/api/transactions");
		expect(status).toBe(401);
		expect(errorOf(body).code).toBe("unauthenticated");
	});

	test("no profile gets 403 profile_required", async () => {
		const { status, body } = await list("", noProfile.cookie);
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});
});

describe("isolation (SEC-2)", () => {
	test("each user sees only their own 22 rows", async () => {
		const mine = pageOf((await list("")).body).items.map((item) => item.id);
		const theirs = pageOf((await list("", other.cookie)).body).items.map(
			(item) => item.id,
		);
		expect(mine).toHaveLength(22);
		expect(theirs).toHaveLength(22);
		expect(mine.filter((id) => theirs.includes(id))).toEqual([]);
	});
});
