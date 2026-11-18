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
import { insertProfile, loadGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import { GET } from "../route";

/** `GET /api/subscriptions/months` (F05 section 11, BR-F05-36) through the route wrapper, real
 * sessions and the golden clock. The figures are tested on `subscriptionMonths`; the query's
 * refusals on `readMonthsQuery`; these show the answers and the wrapper's refusals. */

type User = { id: string; cookie: string };

let owner: Client;
let golden: User;
let other: User;
let noProfile: User;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await signedInUser(owner, "sub-months-route");
	await loadGolden(owner, golden.id);
	other = await signedInUser(owner, "sub-months-route-other");
	await insertProfile(owner, other.id);
	noProfile = await signedInUser(owner, "sub-months-route-new");
	users.push(golden.id, other.id, noProfile.id);
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
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
	call(
		GET,
		`/api/subscriptions/months${query}`,
		cookie === null ? {} : { cookie },
	);

const errorOf = (body: unknown) =>
	(
		body as {
			error: { code: string; details: { params?: string[] } };
		}
	).error;

describe("GET /api/subscriptions/months", () => {
	// AC-F05-24: section 5's figures for October to December.
	test("answers golden's three months with what was charged and what is expected, and the currency", async () => {
		const { status, body } = await read("?from=2026-10&to=2026-12");
		expect(status).toBe(200);
		expect(body).toEqual({
			data: {
				months: [
					{ month: "2026-10", chargedMinor: 2014800, expectedMinor: 0 },
					{
						month: "2026-11",
						chargedMinor: 1800000,
						expectedMinor: 214900,
					},
					{ month: "2026-12", chargedMinor: 0, expectedMinor: 2014900 },
				],
				currency: "INR",
			},
		});
	});

	test("one month is a span of one", async () => {
		const { body } = await read("?from=2026-11&to=2026-11");
		expect((body as { data: { months: unknown[] } }).data.months).toHaveLength(
			1,
		);
	});

	test("a user with no Subscriptions gets zeros", async () => {
		const { status, body } = await read(
			"?from=2026-11&to=2026-12",
			other.cookie,
		);
		expect(status).toBe(200);
		expect(body).toEqual({
			data: {
				months: [
					{ month: "2026-11", chargedMinor: 0, expectedMinor: 0 },
					{ month: "2026-12", chargedMinor: 0, expectedMinor: 0 },
				],
				currency: "INR",
			},
		});
	});

	// AC-F05-24: a span over 24 months returns 400.
	test.each([
		["a span of 25 months", "?from=2026-01&to=2028-01", ["to"]],
		["from after to", "?from=2026-12&to=2026-10", ["from"]],
		["no parameters", "", ["from", "to"]],
		["only from", "?from=2026-10", ["to"]],
		["a month that is not YYYY-MM", "?from=2026-1&to=2026-12", ["from"]],
		["a repeated name", "?from=2026-10&from=2026-11&to=2026-12", ["from"]],
		["a month 121 months away", "?from=2026-10&to=2037-01", ["to"]],
	])(
		"%s is 400 bad_request naming the parameter",
		async (_name, query, params) => {
			const { status, body } = await read(query);
			expect(status).toBe(400);
			expect(errorOf(body)).toMatchObject({
				code: "bad_request",
				details: { params },
			});
		},
	);

	test("another user's Subscriptions never appear in the figures", async () => {
		const { body } = await read("?from=2026-12&to=2026-12", other.cookie);
		expect(
			(body as { data: { months: { expectedMinor: number }[] } }).data
				.months[0],
		).toMatchObject({ expectedMinor: 0 });
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await read("?from=2026-10&to=2026-12", null)).status).toBe(401);
		const { status, body } = await read(
			"?from=2026-10&to=2026-12",
			noProfile.cookie,
		);
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});
});
