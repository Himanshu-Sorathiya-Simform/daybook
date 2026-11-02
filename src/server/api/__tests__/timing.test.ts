// @vitest-environment node
import type { PoolClient } from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Timing, timeQueries } from "../timing";

afterEach(() => {
	vi.useRealTimers();
});

describe("Timing", () => {
	test("starts with no database time", () => {
		expect(new Timing().header()).toMatch(/^db;dur=0, app;dur=\d+$/);
	});

	test("sums database time and rounds to whole milliseconds", () => {
		const timing = new Timing();
		timing.addDb(1.4);
		timing.addDb(2.4);
		expect(timing.db).toBeCloseTo(3.8);
		expect(timing.header()).toMatch(/^db;dur=4, /);
	});

	test("measures app time from creation", async () => {
		const timing = new Timing();
		await new Promise((resolve) => setTimeout(resolve, 25));
		const app = Number(/app;dur=(\d+)/.exec(timing.header())![1]);
		expect(app).toBeGreaterThanOrEqual(20);
	});
});

/** A stand-in pg client whose query resolves after `ms`, recording its calls. */
function fakeClient(ms: number) {
	const calls: unknown[][] = [];
	const client = {
		query(...args: unknown[]) {
			calls.push(args);
			return new Promise((resolve) =>
				setTimeout(() => resolve({ rows: [] }), ms),
			);
		},
	};
	return { client: client as unknown as PoolClient, calls };
}

describe("timeQueries", () => {
	test("adds each query's time and passes its arguments and result through", async () => {
		const { client, calls } = fakeClient(15);
		const timing = new Timing();
		const restore = timeQueries(client, timing);
		const result = await client.query("SELECT $1", [1]);
		await client.query("SELECT 2");
		restore();
		expect(result).toEqual({ rows: [] });
		expect(calls).toEqual([["SELECT $1", [1]], ["SELECT 2"]]);
		expect(timing.db).toBeGreaterThanOrEqual(25);
	});

	test("counts a query that fails", async () => {
		const client = {
			query: () =>
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("x")), 15),
				),
		} as unknown as PoolClient;
		const timing = new Timing();
		timeQueries(client, timing);
		await expect(client.query("SELECT 1")).rejects.toThrow("x");
		expect(timing.db).toBeGreaterThanOrEqual(10);
	});

	test("restores the client's own query, so a pooled client is left as it was", async () => {
		const { client } = fakeClient(1);
		const original = client.query;
		const timing = new Timing();
		const restore = timeQueries(client, timing);
		expect(client.query).not.toBe(original);
		restore();
		expect(client.query).toBe(original);
		await client.query("SELECT 1");
		expect(timing.db).toBe(0);
	});

	test("times a query that returns no promise", () => {
		const client = { query: () => "sync" } as unknown as PoolClient;
		const timing = new Timing();
		timeQueries(client, timing);
		expect(client.query("x")).toBe("sync");
		expect(timing.db).toBeGreaterThanOrEqual(0);
	});
});
