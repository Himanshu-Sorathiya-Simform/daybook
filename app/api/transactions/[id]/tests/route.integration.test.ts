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

import { GOLDEN_NOW, goldenRow } from "../../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import { GET } from "../route";

/** `GET /api/transactions/[id]` (F03 section 11, BR-F03-53, D-479) through the route wrapper,
 * a real session and the golden clock. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let other: LoadedGolden & { cookie: string };

async function goldenUser(label: string) {
	const user = await signedInUser(owner, label);
	return { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
}

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await goldenUser("by-id");
	other = await goldenUser("by-id-other");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, other?.userId].filter(Boolean),
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

const byId = (id: string, cookie = golden.cookie) =>
	call(GET, `/api/transactions/${encodeURIComponent(id)}`, {
		cookie,
		params: { id },
	});

// golden #21: BigBasket, 2,900.00 of food on 14 October at 19:00 IST.
test("answers the row in the API's shape, with the profile's currency", async () => {
	const row = goldenRow(21);
	const { status, body } = await byId(golden.id(21));
	expect(status).toBe(200);
	expect(body).toEqual({
		data: {
			id: golden.id(21),
			type: "expense",
			amountMinor: 290000,
			occurredAt: "2026-10-14T13:30:00.000Z",
			occurredOn: "2026-10-14",
			category: "food",
			goalId: null,
			payee: "BigBasket",
			description: "Monthly groceries",
			note: null,
			source: "manual",
			demo: false,
			subscriptionId: null,
			dueOn: null,
			edited: false,
			version: 1,
			createdAt: new Date(row.createdAt).toISOString(),
			updatedAt: new Date(row.updatedAt).toISOString(),
			currency: "INR",
		},
	});
});

// golden #27 is a charge: source subscription, unlinked at M1 (AC-F03-27).
test("answers a charge with source subscription", async () => {
	const { body } = await byId(golden.id(27));
	expect(body).toMatchObject({
		data: { source: "subscription", subscriptionId: null, amountMinor: 1800000 },
	});
});

test("accepts the id in capitals, as a UUID compares", async () => {
	const { status, body } = await byId(golden.id(21).toUpperCase());
	expect(status).toBe(200);
	expect(body).toMatchObject({ data: { id: golden.id(21) } });
});

// P2, D-479: another user's row, a missing row and a malformed id all read as missing.
test.each([
	["another user's row", () => other.id(21)],
	["a well-formed id no row has", () => "0199a000-0000-7000-8000-00000000ffff"],
	["an id that is not a UUID", () => "abc"],
	["an id with SQL in it", () => "' OR 1=1 --"],
])("%s gets 404 not_found", async (_label, id) => {
	const { status, body } = await byId(id());
	expect(status).toBe(404);
	expect(body).toMatchObject({ error: { code: "not_found" } });
});

test("no session gets 401", async () => {
	const { status } = await call(GET, `/api/transactions/${golden.id(21)}`, {
		params: { id: golden.id(21) },
	});
	expect(status).toBe(401);
});
