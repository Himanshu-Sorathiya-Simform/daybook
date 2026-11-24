import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { insertProfile, loadGoldenBudgets } from "../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import {
	closeOwner,
	connectOwner,
	dataOf,
	errorOf,
	freezeGoldenClock,
	type GoldenSignedIn,
	routeUsers,
	type SignedIn,
} from "@/server/api/__tests__/endpoint";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { GET } from "../route";

/** `GET /api/dashboard` (F08 section 11) through the route wrapper, real sessions and the golden
 * clock. The figures themselves are tested on `dashboardData`; these show each answer the
 * wrapper gives. */

let owner: Client;
let golden: GoldenSignedIn;
let other: GoldenSignedIn;
let noProfile: SignedIn;
let blank: SignedIn;
const users: string[] = [];

beforeAll(async () => {
	owner = await connectOwner();
	({ golden, other, noProfile } = await routeUsers(
		owner,
		users,
		"dashboard-route",
	));
	await loadGoldenBudgets(owner, golden.userId);
	await loadGoldenBudgets(owner, other.userId);
	blank = await signedInUser(owner, "dashboard-route-blank");
	await insertProfile(owner, blank.id);
	users.push(blank.id);
});

afterAll(() => closeOwner(owner, users));

freezeGoldenClock();

type Dashboard = {
	month: string;
	partial: boolean;
	earliestMonth: string;
	accountEmpty: boolean;
	currency: string;
	spending: { outMinor: number; deltaTenths: number | null };
	savings: { incomeMinor: number; rateTenths: number | null };
	budgets: { summary: unknown; count: number };
	subscriptions: { count: number; upcoming: { name: string }[] };
	recent: { items: unknown[] };
	goals: unknown[];
	investments: unknown;
};

const read = (query: string, cookie: string | null = golden.cookie) =>
	call(GET, `/api/dashboard${query}`, cookie === null ? {} : { cookie });

// AC-F08-01
describe("GET /api/dashboard", () => {
	test("answers golden October with the currency, inside the data envelope", async () => {
		const { status, body } = await read("?month=2026-10");
		expect(status).toBe(200);
		expect(Object.keys(body as object)).toEqual(["data"]);
		expect(dataOf<Dashboard>(body)).toMatchObject({
			month: "2026-10",
			partial: false,
			earliestMonth: "2026-09",
			accountEmpty: false,
			currency: "INR",
			spending: { outMinor: 3116800, deltaTenths: 111 },
			savings: { incomeMinor: 8500000, rateTenths: 633 },
			budgets: { summary: { over: 2, atLimit: 1, near: 1 }, count: 4 },
			subscriptions: { count: 4 },
			goals: [],
			investments: null,
		});
		expect(
			dataOf<Dashboard>(body).subscriptions.upcoming.map((row) => row.name),
		).toEqual(["Netflix", "Cult Gym", "Sunrise Apartments", "Amazon Prime"]);
		expect(dataOf<Dashboard>(body).recent.items).toHaveLength(8);
	});

	test("answers the current month, November to date, without a month", async () => {
		const { status, body } = await read("");
		expect(status).toBe(200);
		expect(dataOf<Dashboard>(body)).toMatchObject({
			month: "2026-11",
			partial: true,
			spending: { outMinor: 1842000, deltaTenths: -409 },
		});
	});

	test("treats an empty month as no month", async () => {
		const { body } = await read("?month=");
		expect(dataOf<Dashboard>(body).month).toBe("2026-11");
	});

	test.each(["2026-06", "2000-01"])(
		"answers a month before the first Transaction, %s, with zero figures",
		async (month) => {
			const { status, body } = await read(`?month=${month}`);
			expect(status).toBe(200);
			expect(dataOf<Dashboard>(body)).toMatchObject({
				month,
				accountEmpty: false,
				spending: { outMinor: 0, deltaTenths: null },
				savings: { incomeMinor: 0, rateTenths: null },
			});
			expect(dataOf<Dashboard>(body).recent.items).toEqual([]);
		},
	);

	test("ignores a query name it does not know", async () => {
		const { status, body } = await read("?month=2026-10&range=last_month");
		expect(status).toBe(200);
		expect(dataOf<Dashboard>(body).month).toBe("2026-10");
	});

	test.each([
		"2026-12",
		"2027-11",
		"1999-12",
		"2026-13",
		"2026-00",
		"2026-1",
		"2026-10-01",
		"nope",
	])("refuses month=%s with 400 naming it", async (month) => {
		const { status, body } = await read(`?month=${month}`);
		expect(status).toBe(400);
		expect(errorOf(body)).toMatchObject({
			code: "bad_request",
			details: { params: ["month"] },
		});
	});

	test("refuses a month sent twice", async () => {
		const { status, body } = await read("?month=2026-10&month=2026-09");
		expect(status).toBe(400);
		expect(errorOf(body).details).toMatchObject({ params: ["month"] });
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await read("?month=2026-10", null)).status).toBe(401);
		const { status, body } = await read("?month=2026-10", noProfile.cookie);
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});

	test("another golden user gets the same figures, never doubled, and none of golden's rows", async () => {
		const mine = dataOf<Dashboard>((await read("?month=2026-10")).body);
		const theirs = dataOf<Dashboard>(
			(await read("?month=2026-10", other.cookie)).body,
		);
		expect(theirs.spending).toEqual(mine.spending);
		expect(theirs.subscriptions.count).toBe(4);
		const ids = (items: unknown[]) =>
			(items as { id: string }[]).map((row) => row.id);
		const mineIds = new Set(ids(mine.recent.items));
		expect(ids(theirs.recent.items).some((id) => mineIds.has(id))).toBe(false);
	});

	test("a new account is empty", async () => {
		const { status, body } = await read("?month=2026-11", blank.cookie);
		expect(status).toBe(200);
		expect(dataOf<Dashboard>(body)).toMatchObject({
			accountEmpty: true,
			earliestMonth: "2026-11",
			spending: { outMinor: 0 },
			budgets: { count: 0 },
			subscriptions: { count: 0, upcoming: [] },
		});
	});

	test("carries the request id and a server timing, as every route does", async () => {
		const { headers } = await read("?month=2026-10");
		expect(headers.get("x-request-id")).toBeTruthy();
		expect(headers.get("server-timing")).toContain("db");
	});
});
