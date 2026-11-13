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

/** `GET /api/budgets/summary` (BR-F04-35) through the route wrapper, a real session and the
 * golden clock. The figures are tested on `budgetYearSummary`, the parameter on
 * `readSummaryQuery`. */

type User = { id: string; cookie: string };

let owner: Client;
let golden: User;
let noProfile: User;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await signedInUser(owner, "budget-summary-route");
	await loadGolden(owner, golden.id);
	await loadGoldenBudgets(owner, golden.id);
	noProfile = await signedInUser(owner, "budget-summary-route-new");
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
	call(GET, `/api/budgets/summary${query}`, cookie === null ? {} : { cookie });

// AC-F04-21
test("answers 2026's overall utilization month by month", async () => {
	const { status, body } = await read("?year=2026");
	expect(status).toBe(200);
	const tenths = [
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		810,
		1197,
		38,
		0,
	];
	expect(body).toEqual({
		data: {
			year: 2026,
			months: tenths.map((utilizationTenths, index) => ({
				month: `2026-${String(index + 1).padStart(2, "0")}`,
				utilizationTenths,
			})),
		},
	});
});

// AC-F04-21
test.each(["?year=2022", "?year=2028", "?year=26", ""])(
	"refuses %j with 400 naming year",
	async (query) => {
		const { status, body } = await read(query);
		expect(status).toBe(400);
		expect((body as { error: unknown }).error).toMatchObject({
			code: "bad_request",
			details: { params: ["year"] },
		});
	},
);

test("no session is 401, and no profile 403 profile_required", async () => {
	expect((await read("?year=2026", null)).status).toBe(401);
	const { status, body } = await read("?year=2026", noProfile.cookie);
	expect(status).toBe(403);
	expect((body as { error: { code: string } }).error.code).toBe(
		"profile_required",
	);
});
