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
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import { GET } from "../route";

/** `GET /api/transactions/facets` (BR-F03-59) through the route wrapper, a real session and the
 * golden clock, on golden's M1 rows. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "facets-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "facets-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, noProfile?.id].filter(Boolean),
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

const get = (query: string, cookie: string | null = golden.cookie) =>
	call(
		GET,
		`/api/transactions/facets${query ? `?${query}` : ""}`,
		cookie === null ? {} : { cookie },
	);

const CHECK_B = "from=2026-10-01&to=2026-10-31&cat=food";

// AC-F03-40, through HTTP; golden: section 5's filter counts for check B.
test("check B's counts match section 5, every option present", async () => {
	const { status, body } = await get(CHECK_B);
	expect(status).toBe(200);
	const data = (body as { data: Record<string, Record<string, number>> }).data;
	expect(data["type"]).toEqual({
		income: 0,
		expense: 4,
		refund: 0,
		goal_contribution: 0,
		goal_withdrawal: 0,
	});
	expect(data["date"]).toEqual({
		all: 7,
		this_month: 1,
		last_month: 4,
		last_3_months: 7,
		year_to_date: 7,
		last_12_months: 7,
	});
	expect(data["source"]).toEqual({ manual: 4, subscription: 0 });
	expect(data["category"]).toMatchObject({
		food: 4,
		shopping: 2,
		health: 0,
		gifts: 0,
	});
	// The counts hold no money, so the answer has no currency.
	expect(data).not.toHaveProperty("currency");
});

test("the list parameters change nothing, valid or not", async () => {
	const plain = await get(CHECK_B);
	const listed = await get(`${CHECK_B}&sort=amount&group=week&limit=0`);
	expect(listed.status).toBe(200);
	expect(listed.body).toEqual(plain.body);
});

// D-478: only the filter parameters can refuse; the list parameters are ignored.
test("an invalid filter parameter gets 400 naming it; an invalid sort does not", async () => {
	const { status, body } = await get(`${CHECK_B}&cat=pizza&sort=price`);
	expect(status).toBe(400);
	expect(body).toMatchObject({
		error: { code: "bad_request", details: { params: ["cat"] } },
	});
});

test("no session gets 401, and no profile 403 profile_required", async () => {
	expect((await get("", null)).status).toBe(401);
	const { status, body } = await get("", noProfile.cookie);
	expect(status).toBe(403);
	expect(body).toMatchObject({ error: { code: "profile_required" } });
});
