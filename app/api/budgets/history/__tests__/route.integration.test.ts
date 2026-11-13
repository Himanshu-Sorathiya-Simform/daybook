import { Client } from "pg";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	test,
	vi,
} from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden, loadGoldenBudgets } from "../../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import { GET } from "../route";

/** `GET /api/budgets/history` (BR-F04-35) through the route wrapper, a real session and the
 * golden clock. The figures are tested on `budgetHistory`, the parameters on
 * `readHistoryQuery`. */

type User = { id: string; cookie: string };

let owner: Client;
let golden: User;
let noProfile: User;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await signedInUser(owner, "budget-history-route");
	await loadGolden(owner, golden.id);
	await loadGoldenBudgets(owner, golden.id);
	noProfile = await signedInUser(owner, "budget-history-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.id, noProfile?.id].filter(Boolean),
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

const read = (query: string, cookie: string | null = golden.cookie) =>
	call(GET, `/api/budgets/history${query}`, cookie === null ? {} : { cookie });

// AC-F04-20
test("answers food's last 6 months to November with the currency", async () => {
	const { status, body } = await read("?category=food&to=2026-11");
	expect(status).toBe(200);
	expect(body).toEqual({
		data: {
			category: "food",
			currency: "INR",
			months: [
				{ month: "2026-06", limitMinor: null, spentMinor: 0 },
				{ month: "2026-07", limitMinor: null, spentMinor: 0 },
				{ month: "2026-08", limitMinor: null, spentMinor: 0 },
				{ month: "2026-09", limitMinor: 600000, spentMinor: 505000 },
				{ month: "2026-10", limitMinor: 500000, spentMinor: 622000 },
				{ month: "2026-11", limitMinor: 500000, spentMinor: 42000 },
			],
		},
	});
});

// AC-F04-20
test("answers health, which has no Budget record, with its spending", async () => {
	const { status, body } = await read("?category=health&to=2026-10&months=2");
	expect(status).toBe(200);
	expect((body as { data: { months: unknown } }).data.months).toEqual([
		{ month: "2026-09", limitMinor: null, spentMinor: 150000 },
		{ month: "2026-10", limitMinor: null, spentMinor: 0 },
	]);
});

// AC-F04-20
test.each([
	["?category=food&to=2026-11&months=50", ["months"]],
	["?category=food&to=2026-11&months=0", ["months"]],
	["?category=food&to=2027-12", ["to"]],
	["?category=salary&to=2026-11", ["category"]],
	["", ["category", "to"]],
])("refuses %s with 400 naming %j", async (query, params) => {
	const { status, body } = await read(query);
	expect(status).toBe(400);
	expect((body as { error: unknown }).error).toMatchObject({
		code: "bad_request",
		details: { params },
	});
});

test("no session is 401, and no profile 403 profile_required", async () => {
	expect((await read("?category=food&to=2026-11", null)).status).toBe(401);
	const { status, body } = await read(
		"?category=food&to=2026-11",
		noProfile.cookie,
	);
	expect(status).toBe(403);
	expect((body as { error: { code: string } }).error.code).toBe(
		"profile_required",
	);
});
