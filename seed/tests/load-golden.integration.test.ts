import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { parseOwnerEnv, parseServerEnv } from "../../src/server/env";
import { createUser } from "../../src/server/db/tests/private-rows";
import { GOLDEN_ALL, goldenRow } from "../golden";
import { GOLDEN_M1_ROWS, loadGolden, type LoadedGolden } from "../load-golden";

/** The golden loader (D-471), against a real database: two users each get their own copy. */

let owner: Client;
let runtime: Pool;
let first: LoadedGolden;
let second: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	runtime = new Pool({
		connectionString: parseServerEnv(process.env).DATABASE_URL_RUNTIME,
		max: 1,
	});
	first = await loadGolden(owner, await createUser(owner, "golden-load"));
	second = await loadGolden(owner, await createUser(owner, "golden-load-2"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[first?.userId, second?.userId].filter(Boolean),
	]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

/** What the runtime role sees as `userId`, through RLS. */
async function asUser<T extends Record<string, unknown>>(
	userId: string,
	query: string,
): Promise<T[]> {
	const client = await runtime.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
		return (await client.query<T>(query)).rows;
	} finally {
		await client.query("ROLLBACK").catch(() => {});
		client.release();
	}
}

const GOAL_ROWS = [3, 9, 14, 22, 23];

describe("the M1 rows", () => {
	test("are #1 to #27 without the five Goal rows: 22 rows", () => {
		const expected = Array.from({ length: 27 }, (_, i) => i + 1).filter(
			(n) => !GOAL_ROWS.includes(n),
		);
		expect(GOLDEN_M1_ROWS.map((row) => row.golden)).toEqual(expected);
		expect(GOLDEN_M1_ROWS).toHaveLength(22);
	});

	test("include #27, which catch-up would create from F05 on", () => {
		expect(GOLDEN_M1_ROWS).toContainEqual(goldenRow(27));
	});
});

describe("a load", () => {
	test("writes all 22 rows for the user, field for field", async () => {
		const stored = await asUser<{
			id: string;
			type: string;
			amount_minor: string;
			occurred_at: Date;
			occurred_on: string;
			category: string;
			payee: string;
			description: string | null;
			note: string | null;
			source: string;
			demo: boolean;
			version: number;
			created_at: Date;
			updated_at: Date;
		}>(
			first.userId,
			`SELECT id, type, amount_minor, occurred_at, occurred_on::text, category, payee,
			        description, note, source, demo, version, created_at, updated_at
			 FROM app.transactions ORDER BY occurred_on, occurred_at, id`,
		);
		expect(stored).toHaveLength(22);
		for (const row of stored) {
			const golden = goldenRow(first.golden(row.id));
			expect({
				type: row.type,
				amountMinor: Number(row.amount_minor),
				occurredAt: row.occurred_at.toISOString(),
				occurredOn: row.occurred_on,
				category: row.category,
				payee: row.payee,
				description: row.description,
				note: row.note,
				source: row.source,
				demo: row.demo,
				version: row.version,
				createdAt: row.created_at.toISOString(),
				updatedAt: row.updated_at.toISOString(),
			}).toEqual({
				type: golden.type,
				amountMinor: golden.amountMinor,
				occurredAt: new Date(golden.occurredAt).toISOString(),
				occurredOn: golden.occurredOn,
				category: golden.category,
				payee: golden.payee,
				description: golden.description,
				note: golden.note,
				source: golden.source,
				demo: false,
				version: 1,
				createdAt: new Date(golden.createdAt).toISOString(),
				updatedAt: new Date(golden.updatedAt).toISOString(),
			});
		}
	});

	// golden: Setup, the India profile.
	test("writes the golden profile", async () => {
		const [profile] = await asUser(
			first.userId,
			`SELECT country, currency, timezone, week_start, last_catch_up_on::text
			 FROM app.profile`,
		);
		expect(profile).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			week_start: "monday",
			last_catch_up_on: "2026-11-02",
		});
	});

	test("is visible only to its own user", async () => {
		const seen = await asUser<{ id: string }>(
			second.userId,
			"SELECT id FROM app.transactions",
		);
		expect(seen).toHaveLength(22);
		const firstIds = new Set(first.rows.map((row) => row.id));
		expect(seen.some((row) => firstIds.has(row.id))).toBe(false);
	});
});

describe("ids", () => {
	test("differ between loads, so every user can hold a copy", () => {
		expect(first.id(12)).not.toBe(second.id(12));
		expect(first.id(12)).not.toBe(goldenRow(12).id);
	});

	test("are UUIDv7s that keep the golden id order, which breaks ties in every list", () => {
		const byGoldenId = [...GOLDEN_M1_ROWS]
			.sort((a, b) => (a.id < b.id ? -1 : 1))
			.map((row) => row.golden);
		const byLoadedId = [...first.rows]
			.sort((a, b) => (a.id < b.id ? -1 : 1))
			.map((row) => row.golden);
		expect(byLoadedId).toEqual(byGoldenId);
		for (const row of first.rows) {
			expect(row.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
			);
		}
	});

	test("map to and from golden row numbers", () => {
		expect(first.golden(first.id(26))).toBe(26);
		expect(first.rows.find((row) => row.golden === 26)?.id).toBe(first.id(26));
	});

	test.each(GOAL_ROWS)("refuse Goal row #%i, which M1 does not load", (n) => {
		expect(() => first.id(n)).toThrow(`Golden row #${n} is not loaded at M1.`);
	});

	test("refuse an id from another load", () => {
		expect(() => first.golden(second.id(4))).toThrow(
			"is not a golden row of this load",
		);
	});

	test("leave the shared fixture untouched", () => {
		expect(GOLDEN_ALL.find((row) => row.golden === 12)?.id).toBe(
			"0199a000-0000-7000-8000-000000000012",
		);
	});
});
