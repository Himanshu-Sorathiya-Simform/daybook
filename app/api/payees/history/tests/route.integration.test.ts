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

/** `GET /api/payees/history` (BR-F03-62) through the route wrapper, a real session and the golden clock,
 * on golden's M1 rows. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "history-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "history-route-new");
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
		`/api/payees/history${query ? `?${query}` : ""}`,
		cookie === null ? {} : { cookie },
	);

test("no session gets 401, and no profile 403 profile_required", async () => {
	expect((await get("", null)).status).toBe(401);
	const { status, body } = await get("", noProfile.cookie);
	expect(status).toBe(403);
	expect(body).toMatchObject({ error: { code: "profile_required" } });
});

// AC-F03-43, through HTTP; golden: section 5's payee history table.
test("Swiggy over the default 3 months matches section 5, with currency", async () => {
	const { status, body } = await get("payee=Swiggy");
	expect(status).toBe(200);
	expect(body).toEqual({
		data: {
			count: 4,
			inMinor: 0,
			outMinor: 329000,
			usualDay: 3,
			currency: "INR",
		},
	});
});

// AC-F03-43
test("payee=swiggy&months=1 matches section 5's one-month row", async () => {
	const { body } = await get("payee=swiggy&months=1");
	expect(body).toEqual({
		data: {
			count: 3,
			inMinor: 0,
			outMinor: 144000,
			usualDay: 19,
			currency: "INR",
		},
	});
});

// AC-F03-43
test("a payee with no rows answers zeros and a null usualDay", async () => {
	const { body } = await get("payee=Nobody");
	expect(body).toEqual({
		data: { count: 0, inMinor: 0, outMinor: 0, usualDay: null, currency: "INR" },
	});
});

// AC-F03-43
test.each([
	["payee=Swiggy&months=0", ["months"]],
	["payee=Swiggy&months=13", ["months"]],
	["payee=Swiggy&months=", ["months"]],
	[`payee=${"a".repeat(81)}`, ["payee"]],
	["months=3", ["payee"]],
	["months=13", ["payee", "months"]],
])("%s gets 400 naming %j", async (query, params) => {
	const { status, body } = await get(query);
	expect(status).toBe(400);
	expect(body).toMatchObject({
		error: { code: "bad_request", details: { params } },
	});
});
