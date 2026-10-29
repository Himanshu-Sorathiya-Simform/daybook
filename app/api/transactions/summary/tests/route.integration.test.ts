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

/** `GET /api/transactions/summary` (BR-F03-41, BR-F03-58) through the route wrapper, a real session and the
 * golden clock, on golden's M1 rows. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "summary-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "summary-route-new");
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
		`/api/transactions/summary${query ? `?${query}` : ""}`,
		cookie === null ? {} : { cookie },
	);

const CHECK_B = "from=2026-10-01&to=2026-10-31&cat=food";

// AC-F03-39, through HTTP. At M1 check A's To Goals is 0: the Goal rows are not loaded.
test("check A with by=category,payee gives section 5's span and breakdowns", async () => {
	const { status, body } = await get(
		"from=2026-10-01&to=2026-10-31&by=category,payee",
	);
	expect(status).toBe(200);
	expect(body).toMatchObject({
		data: {
			count: 11,
			incomeMinor: 8500000,
			spendingMinor: 3116800,
			toGoalsMinor: 0,
			currency: "INR",
			firstOn: "2026-10-01",
			lastOn: "2026-10-31",
		},
	});
	const data = (
		body as {
			data: { byCategory: { key: string }[]; byPayee: { key: string }[] };
		}
	).data;
	expect(data.byCategory.map(({ key }) => key)).toEqual([
		"housing",
		"food",
		"shopping",
		"entertainment",
		"transportation",
	]);
	expect(data.byPayee).toHaveLength(6);
});

// AC-F03-39
test("without by, the answer has neither breakdown", async () => {
	const { body } = await get("from=2026-10-01&to=2026-10-31");
	expect(body).toEqual({
		data: {
			count: 11,
			incomeMinor: 8500000,
			spendingMinor: 3116800,
			toGoalsMinor: 0,
			currency: "INR",
			firstOn: "2026-10-01",
			lastOn: "2026-10-31",
		},
	});
});

// AC-F03-39, BR-F03-58
test.each(["by=week", "by=", "by=category,category", "by=category&by=payee"])(
	"%s gets 400 naming by",
	async (query) => {
		const { status, body } = await get(query);
		expect(status).toBe(400);
		expect(body).toMatchObject({ error: { details: { params: ["by"] } } });
	},
);

// golden check I: 1 and 2 November, #26 and #27; F03 section 3: the list parameters are ignored.
test("check I's totals, with sort=price and group=week ignored", async () => {
	const { status, body } = await get(
		"from=2026-11-01&to=2026-11-02&sort=price&group=week",
	);
	expect(status).toBe(200);
	expect(body).toMatchObject({ data: { count: 2, spendingMinor: 1842000 } });
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
