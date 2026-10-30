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

// T3: the payee in the query string, and the months at their edges (BR-F03-62, D-482).
describe("the payee in the query", () => {
	/** A committed expense of golden's, with `payee`, so the history has something to find. */
	async function withPayee(payee: string, fn: () => Promise<void>) {
		const { rows } = await owner.query<{ id: string }>(
			`INSERT INTO app.transactions (id, user_id, created_at, updated_at, type, amount_minor,
			   occurred_at, occurred_on, category, payee, source, version)
			 VALUES (gen_random_uuid(), $1, $2, $2, 'expense', 12345, '2026-10-20T06:30:00Z',
			   '2026-10-20', 'food', $3, 'manual', 1)
			 RETURNING id`,
			[golden.userId, GOLDEN_NOW, payee],
		);
		try {
			await fn();
		} finally {
			await owner.query("DELETE FROM app.transactions WHERE id = $1", [
				rows[0]!.id,
			]);
		}
	}

	test.each([
		"A/B?#%",
		"100% Pure",
		"a+b",
		"Café & Co",
		"50/50",
		"q=1&x=2",
		"\\back",
		"ä€ \u{1f44d}",
	])("%j, percent-encoded, reaches the query unchanged", async (payee) => {
		await withPayee(payee, async () => {
			const { status, body } = await get(`payee=${encodeURIComponent(payee)}`);
			expect(status).toBe(200);
			expect(body).toEqual({
				data: {
					count: 1,
					inMinor: 0,
					outMinor: 12345,
					usualDay: null,
					currency: "INR",
				},
			});
		});
	});

	test("a + in the query is a space, as in any query string", async () => {
		await withPayee("Big Basket", async () => {
			const { body } = await get("payee=Big+Basket");
			expect(body).toMatchObject({ data: { count: 1 } });
		});
	});

	test("a payee of 80 characters is read and one of 81 gets 400", async () => {
		expect((await get(`payee=${"a".repeat(80)}`)).status).toBe(200);
		expect((await get(`payee=${"a".repeat(81)}`)).status).toBe(400);
		// 80 emoji are 80 code points, though 160 UTF-16 units.
		expect(
			(await get(`payee=${encodeURIComponent("\u{1f44d}".repeat(80))}`))
				.status,
		).toBe(200);
		expect(
			(await get(`payee=${encodeURIComponent("\u{1f44d}".repeat(81))}`))
				.status,
		).toBe(400);
	});

	test.each([
		["a tab", "%09"],
		["a line feed", "%0A"],
		["a NUL", "%00"],
		["a delete character", "%7F"],
		["a next-line character", "%C2%85"],
		["a line separator", "%E2%80%A8"],
	])("%s inside the payee gets 400 naming payee", async (_name, escaped) => {
		const { status, body } = await get(`payee=Sw${escaped}iggy`);
		expect(status).toBe(400);
		expect(body).toMatchObject({ error: { details: { params: ["payee"] } } });
	});

	test("a payee that is spaces only, or invisible characters only, gets 400", async () => {
		for (const payee of ["%20%20", "%E2%80%8B", "%09"]) {
			expect((await get(`payee=${payee}`)).status).toBe(400);
		}
	});

	test("a decomposed payee finds the composed one, since the query is read in NFC", async () => {
		await withPayee("Caf\u00e9", async () => {
			const { body } = await get(`payee=${encodeURIComponent("Cafe\u0301")}`);
			expect(body).toMatchObject({ data: { count: 1 } });
		});
	});

	test("bytes that are not UTF-8 are read as the replacement character, which is text", async () => {
		// %ED%A0%80 is a surrogate written in UTF-8, which is not valid; the URL decoder turns each
		// bad byte into U+FFFD, so the payee is ordinary text that no row has.
		const { status, body } = await get("payee=a%ED%A0%80");
		expect(status).toBe(200);
		expect(body).toMatchObject({ data: { count: 0 } });
	});
});

describe("months at its edges", () => {
	test.each([1, 2, 6, 11, 12])("months=%i is read", async (months) => {
		const { status, body } = await get(`payee=Swiggy&months=${months}`);
		expect(status).toBe(200);
		expect(body).toMatchObject({ data: { currency: "INR" } });
	});

	test("twelve months reaches a year back and one month only the last", async () => {
		const one = (await get("payee=Swiggy&months=1")).body as {
			data: { count: number };
		};
		const twelve = (await get("payee=Swiggy&months=12")).body as {
			data: { count: number };
		};
		expect(twelve.data.count).toBeGreaterThanOrEqual(one.data.count);
	});

	test.each([
		"0",
		"13",
		"00",
		"01",
		"012",
		"1.0",
		"-1",
		"1e1",
		"twelve",
		" 3",
		"%203",
	])("months=%s gets 400 naming months", async (months) => {
		const { status, body } = await get(`payee=Swiggy&months=${months}`);
		expect(status).toBe(400);
		expect(body).toMatchObject({ error: { details: { params: ["months"] } } });
	});

	test("a repeated months gets 400, and a repeated payee too", async () => {
		expect((await get("payee=Swiggy&months=3&months=3")).status).toBe(400);
		expect((await get("payee=Swiggy&payee=Swiggy")).status).toBe(400);
	});
});
