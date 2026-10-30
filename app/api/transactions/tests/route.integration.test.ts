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

// T3: the query's edges (F03 section 11, D-478, D-458, D-500).
describe("the query's edges", () => {
	test("`sort=amount&group=day` gets 400 naming group", async () => {
		const { status, body } = await list("sort=amount&group=day");
		expect(status).toBe(400);
		expect(errorOf(body).details).toEqual({ params: ["group"] });
	});

	test("a repeated cat gets 400 naming cat, repeated or not valid", async () => {
		for (const query of [
			"cat=food&cat=shopping",
			"cat=food&cat=food",
			"cat=&cat=",
		]) {
			const { status, body } = await list(query);
			expect(status).toBe(400);
			expect(errorOf(body).details).toEqual({ params: ["cat"] });
		}
	});

	test("an empty cat is no filter, and answers every row", async () => {
		const empty = pageOf((await list("cat=")).body);
		expect(numbers(empty)).toEqual(NEWEST_FIRST);
	});

	test("txn, view and new are the page's own, so the list ignores them", async () => {
		const plain = pageOf((await list("")).body);
		const noisy = pageOf(
			(
				await list(
					`txn=${golden.id(21)}&view=0199a000-0000-7000-8000-000000000001&new=1&page=3`,
				)
			).body,
		);
		expect(noisy).toEqual(plain);
	});

	test.each([
		["1", 200],
		["100", 200],
		["101", 400],
		["0", 400],
		["01", 400],
		["1.5", 400],
		["-1", 400],
		["abc", 400],
		["1e2", 400],
	])("limit=%s answers %i", async (limit, status) => {
		const answer = await list(`limit=${limit}`);
		expect(answer.status).toBe(status);
		if (status === 400)
			expect(errorOf(answer.body).details).toEqual({ params: ["limit"] });
	});

	test("limit=100 answers all 22 rows on one page with no cursor", async () => {
		const page = pageOf((await list("limit=100")).body);
		expect(page.items).toHaveLength(22);
		expect(page.nextCursor).toBeNull();
	});

	test("the bad parameters are named in the reader's fixed order, then limit and cursor", async () => {
		const { body } = await list(
			"limit=0&group=week&cat=pizza&from=2026-13-01&cursor=junk",
		);
		expect(errorOf(body).details).toEqual({
			params: ["from", "cat", "group", "limit", "cursor"],
		});
	});

	// BR-F03-35: % in a search is a percent sign, not a wildcard.
	test("`q=50%25` finds a row with 50% in it and not one with 500", async () => {
		const user = await goldenUser("list-route-percent");
		try {
			for (const [payee, description] of [
				["Deal shop", "50% off"],
				["Deal shop", "500 off"],
			] as const) {
				await owner.query(
					`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
					   occurred_at, occurred_on, category, payee, description, source, version)
					 VALUES (gen_random_uuid(), $1, $2, $2, 'expense', 100, $2, '2026-11-02', 'food', $3, $4,
					   'manual', 1)`,
					[user.userId, GOLDEN_NOW, payee, description],
				);
			}
			const page = pageOf((await list("q=50%25", user.cookie)).body);
			expect(page.items.map((item) => item.description)).toEqual(["50% off"]);
			// Three underscores would match every row with 3 characters, if _ were a wildcard.
			const underscore = pageOf((await list("q=___", user.cookie)).body);
			expect(underscore.items).toEqual([]);
		} finally {
			await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [
				user.userId,
			]);
		}
	});

	// D-470: no user has a Goal before M2, so a Goal filter matches nothing: it is valid.
	test.each([
		["an uppercase UUID", "0199A000-0000-7000-8001-00000000ABCD"],
		["the nil UUID", "00000000-0000-0000-0000-000000000000"],
	])("goal=%s is read, not refused, and matches no row", async (_name, goal) => {
		const answer = await list(`goal=${goal}`);
		expect(answer.status).toBe(200);
		expect(pageOf(answer.body).items).toEqual([]);
	});

	test("goal=nope is not a UUID, so it gets 400 naming goal", async () => {
		const { status, body } = await list("goal=nope");
		expect(status).toBe(400);
		expect(errorOf(body).details).toEqual({ params: ["goal"] });
	});
});
