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

/** `GET /api/transactions/amount-histogram` (BR-F03-60) through the route wrapper, a real session and the
 * golden clock, on golden's M1 rows. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "histogram-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "histogram-route-new");
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
		`/api/transactions/amount-histogram${query ? `?${query}` : ""}`,
		cookie === null ? {} : { cookie },
	);

const CHECK_B = "from=2026-10-01&to=2026-10-31&cat=food";

// AC-F03-41, through HTTP; golden: section 5's histogram for check B.
const CHECK_B_HISTOGRAM = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
	currency: "INR",
};

test("check B matches section 5, with the profile's currency", async () => {
	const { status, body } = await get(CHECK_B);
	expect(status).toBe(200);
	expect(body).toEqual({ data: CHECK_B_HISTOGRAM });
});

// AC-F03-41; D-478: min and max are ignored, valid or not.
test.each([
	"min=1000.00",
	"max=500.00",
	"min=abc",
	"min=500.00&max=100.00",
	"sort=price",
])("adding %s changes nothing", async (extra) => {
	const { status, body } = await get(`${CHECK_B}&${extra}`);
	expect(status).toBe(200);
	expect(body).toEqual({ data: CHECK_B_HISTOGRAM });
});

// AC-F03-41
test("a filter with no rows gives two empty arrays", async () => {
	const { body } = await get("q=zzzz");
	expect(body).toEqual({ data: { edges: [], counts: [], currency: "INR" } });
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
