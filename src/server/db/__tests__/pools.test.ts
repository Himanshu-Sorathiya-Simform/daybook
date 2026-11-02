// @vitest-environment node
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Placeholder values only. No test here connects: a pg Pool opens a connection on first query.
const roleUrl = (role: string) =>
	`postgresql://${role}:pw@db-pooler.example.com/neondb?sslmode=verify-full`;

const validServer = {
	APP_ORIGIN: "http://localhost:3000",
	BETTER_AUTH_SECRET: "x".repeat(32),
	DATABASE_URL_AUTH: roleUrl("daybook_auth"),
	DATABASE_URL_RUNTIME: roleUrl("daybook_runtime"),
	DATABASE_URL_SYSTEM: roleUrl("daybook_system"),
};

type PoolStore = typeof globalThis & { __daybookPools?: Record<string, Pool> };

async function freshModule() {
	vi.resetModules();
	return import("../pools");
}

beforeEach(() => {
	for (const [name, value] of Object.entries(validServer)) vi.stubEnv(name, value);
});

afterEach(async () => {
	const store = globalThis as PoolStore;
	await Promise.all(
		Object.values(store.__daybookPools ?? {}).map((pool) => pool.end()),
	);
	delete store.__daybookPools;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("poolConfig", () => {
	test.each([
		["runtime", 10],
		["auth", 5],
		["system", 3],
	] as const)("gives the %s pool at most %i connections", async (name, max) => {
		const { poolConfig } = await freshModule();
		expect(poolConfig(name, "postgresql://u@h/d").max).toBe(max);
	});

	test("waits 10 seconds to connect and closes idle connections after 30", async () => {
		const { poolConfig } = await freshModule();
		expect(poolConfig("runtime", "postgresql://u@h/d")).toMatchObject({
			connectionTimeoutMillis: 10_000,
			idleTimeoutMillis: 30_000,
		});
	});

	test("uses the connection string it is given", async () => {
		const { poolConfig } = await freshModule();
		expect(poolConfig("auth", "postgresql://u@h/d").connectionString).toBe(
			"postgresql://u@h/d",
		);
	});
});

describe("the pool getters", () => {
	test.each([
		["runtimePool", "DATABASE_URL_RUNTIME", 10],
		["authPool", "DATABASE_URL_AUTH", 5],
		["systemPool", "DATABASE_URL_SYSTEM", 3],
	] as const)(
		"%s connects with %s and its own size",
		async (getter, variable, max) => {
			const pools = await freshModule();
			const pool = pools[getter]();
			expect(pool).toBeInstanceOf(Pool);
			expect(pool.options.connectionString).toBe(validServer[variable]);
			expect(pool.options.max).toBe(max);
		},
	);

	test("returns the same pool on every call", async () => {
		const { runtimePool } = await freshModule();
		expect(runtimePool()).toBe(runtimePool());
	});

	test("keeps one separate pool per role", async () => {
		const { authPool, runtimePool, systemPool } = await freshModule();
		expect(new Set([authPool(), runtimePool(), systemPool()]).size).toBe(3);
	});

	test("reuses a pool after the module reloads, as a development hot reload does", async () => {
		const first = (await freshModule()).runtimePool();
		const second = (await freshModule()).runtimePool();
		expect(second).toBe(first);
	});

	test("creates no pool until one is asked for", async () => {
		await freshModule();
		expect((globalThis as PoolStore).__daybookPools).toBeUndefined();
	});

	test("refuses to create a pool when the environment is invalid, and caches nothing", async () => {
		vi.stubEnv("DATABASE_URL_RUNTIME", "");
		const { runtimePool } = await freshModule();
		const { EnvError } = await import("../../env");
		expect(() => runtimePool()).toThrow(EnvError);
		expect(
			(globalThis as PoolStore).__daybookPools?.["runtime"],
		).toBeUndefined();
	});

	test("logs an idle connection failure instead of crashing the process", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const { systemPool } = await freshModule();
		const pool = systemPool();
		expect(() =>
			pool.emit("error", new Error("terminating connection")),
		).not.toThrow();
		expect(log).toHaveBeenCalledWith(
			"Idle connection in the system pool failed:",
			"terminating connection",
		);
	});
});

describe("safeInt", () => {
	test("is exported beside the pools for query code", async () => {
		const { safeInt } = await freshModule();
		expect(safeInt("124050")).toBe(124050);
	});
});
