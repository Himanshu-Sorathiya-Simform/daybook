import { randomUUIDv7 } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createUser, insertRow, PRIVATE_ROWS } from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import {
	DAILY_PASS_STEPS,
	type DailyPassStep,
	resetDailyPassNote,
	runDailyPassIfDue,
} from "../daily-pass";

// Days no real request reaches, so each test owns its markers; they are deleted around it.
const DAY_1 = new Date("2099-01-01T10:00:00.000Z");
const DAY_2 = new Date("2099-01-02T00:30:00.000Z");
const TEST_DAYS = ["2099-01-01", "2099-01-02"];
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

let owner: Client;
const users: string[] = [];

let calls: Date[] = [];
let behaviour: "count" | "fail" | "prices" = "count";

const testStep: DailyPassStep = async (_client, now) => {
	if (behaviour === "fail") throw new Error("price feed down");
	calls.push(now);
	return behaviour === "prices" ? { pricesUpdated: true } : undefined;
};

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	DAILY_PASS_STEPS.push(testStep);
});

afterAll(async () => {
	DAILY_PASS_STEPS.splice(DAILY_PASS_STEPS.indexOf(testStep), 1);
	await owner.query(
		"DELETE FROM app.daily_pass_markers WHERE day = ANY($1::date[])",
		[TEST_DAYS],
	);
	await owner.query(`DELETE FROM auth."user" WHERE id = ANY($1::uuid[])`, [users]);
	await owner.end();
});

beforeEach(async () => {
	resetDailyPassNote();
	calls = [];
	behaviour = "count";
	await owner.query(
		"DELETE FROM app.daily_pass_markers WHERE day = ANY($1::date[])",
		[TEST_DAYS],
	);
});

async function markers(): Promise<string[]> {
	const { rows } = await owner.query(
		"SELECT day::text AS day FROM app.daily_pass_markers WHERE day = ANY($1::date[]) ORDER BY day",
		[TEST_DAYS],
	);
	return rows.map((row) => row.day);
}

test("the first request of a UTC day writes the marker and runs every step once", async () => {
	expect(await runDailyPassIfDue(DAY_1)).toEqual({ pricesUpdated: false });
	expect(await markers()).toEqual(["2099-01-01"]);
	expect(calls).toEqual([DAY_1]);
});

test("the marker records the request clock", async () => {
	await runDailyPassIfDue(DAY_1);
	const { rows } = await owner.query(
		"SELECT created_at FROM app.daily_pass_markers WHERE day = '2099-01-01'",
	);
	expect(rows[0].created_at).toEqual(DAY_1);
});

test("later requests that day skip it, by the process's note", async () => {
	await runDailyPassIfDue(DAY_1);
	// Even with the marker gone, the note says today is done.
	await owner.query("DELETE FROM app.daily_pass_markers WHERE day = '2099-01-01'");
	await runDailyPassIfDue(new Date(DAY_1.getTime() + 5 * MINUTE));
	expect(calls).toHaveLength(1);
	expect(await markers()).toEqual([]);
});

test("a day another process has done runs no step, and notes it", async () => {
	await owner.query(
		"INSERT INTO app.daily_pass_markers (day, created_at) VALUES ('2099-01-01', $1)",
		[DAY_1],
	);
	await runDailyPassIfDue(DAY_1);
	expect(calls).toHaveLength(0);
	await owner.query("DELETE FROM app.daily_pass_markers WHERE day = '2099-01-01'");
	await runDailyPassIfDue(DAY_1);
	expect(calls).toHaveLength(0);
});

test("the next UTC day runs again, whatever any user's zone", async () => {
	await runDailyPassIfDue(DAY_1);
	await runDailyPassIfDue(DAY_2);
	expect(await markers()).toEqual(["2099-01-01", "2099-01-02"]);
	expect(calls).toEqual([DAY_1, DAY_2]);
});

// AC-P2-26 (the half that needs no prices: F07 adds them)
test("two runs at once write the marker and run each step once", async () => {
	await Promise.all([runDailyPassIfDue(DAY_1), runDailyPassIfDue(DAY_1)]);
	expect(await markers()).toEqual(["2099-01-01"]);
	expect(calls).toHaveLength(1);
});

test("reports pricesUpdated when a step wrote prices", async () => {
	behaviour = "prices";
	expect(await runDailyPassIfDue(DAY_1)).toEqual({ pricesUpdated: true });
	expect(await runDailyPassIfDue(DAY_1)).toEqual({ pricesUpdated: false });
});

describe("a failure", () => {
	// AC-P2-27
	test("leaves no marker, is logged, and is retried a minute later, not sooner", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			behaviour = "fail";
			expect(await runDailyPassIfDue(DAY_1)).toEqual({ pricesUpdated: false });
			expect(await markers()).toEqual([]);
			expect(error).toHaveBeenCalledWith("[daily-pass] Failed", {
				name: "Error",
			});
		} finally {
			error.mockRestore();
		}
		behaviour = "count";
		await runDailyPassIfDue(new Date(DAY_1.getTime() + 59 * 1000));
		expect(calls).toHaveLength(0);
		expect(await markers()).toEqual([]);
		await runDailyPassIfDue(new Date(DAY_1.getTime() + MINUTE));
		expect(calls).toHaveLength(1);
		expect(await markers()).toEqual(["2099-01-01"]);
	});

	test("rolls back the steps' own writes with the marker", async () => {
		const writes: DailyPassStep = async (client, now) => {
			await client.query(
				"INSERT INTO app.daily_pass_markers (day, created_at) VALUES ('2099-01-02', $1)",
				[now],
			);
			throw new Error("after a write");
		};
		DAILY_PASS_STEPS.unshift(writes);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await runDailyPassIfDue(DAY_1);
			expect(await markers()).toEqual([]);
		} finally {
			error.mockRestore();
			DAILY_PASS_STEPS.splice(DAILY_PASS_STEPS.indexOf(writes), 1);
		}
	});
});

describe("the idempotency purge", () => {
	test("deletes records older than 90 days and keeps the rest", async () => {
		const userId = await createUser(owner, "daily-pass");
		users.push(userId);
		const at = (days: number) =>
			new Date(DAY_1.getTime() - days * DAY).toISOString();
		const record = (createdAt: string) => ({
			...PRIVATE_ROWS.idempotency_records(userId),
			id: randomUUIDv7(),
			created_at: createdAt,
			updated_at: createdAt,
		});
		const old = record(at(91));
		const edge = record(at(90));
		const recent = record(at(89));
		for (const row of [old, edge, recent])
			await insertRow(owner, "idempotency_records", row);
		await runDailyPassIfDue(DAY_1);
		const { rows } = await owner.query(
			"SELECT id FROM app.idempotency_records WHERE user_id = $1 ORDER BY created_at",
			[userId],
		);
		expect(rows.map((row) => row.id)).toEqual([edge.id, recent.id]);
	});
});
