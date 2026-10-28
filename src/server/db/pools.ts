import "server-only";
import { Pool, type PoolConfig } from "pg";
import { serverEnv } from "../env";

export { safeInt } from "./safe-int";

/** The three connection pools, one per database role (SEC-1). Each connects to Neon's
 * pooled endpoint with its own role, so a bug in one part of the app cannot borrow another
 * part's powers. Sizes and timeouts come from P2, section 11. */
export type PoolName = "auth" | "runtime" | "system";

const SIZES: Record<PoolName, number> = { runtime: 10, auth: 5, system: 3 };

export function poolConfig(name: PoolName, connectionString: string): PoolConfig {
	return {
		connectionString,
		max: SIZES[name],
		// Neon's free compute sleeps after 5 idle minutes and can take seconds to wake (P2, 13).
		connectionTimeoutMillis: 10_000,
		idleTimeoutMillis: 30_000,
	};
}

const URL_VARIABLE = {
	auth: "DATABASE_URL_AUTH",
	runtime: "DATABASE_URL_RUNTIME",
	system: "DATABASE_URL_SYSTEM",
} as const satisfies Record<PoolName, string>;

// Kept on globalThis so a development hot reload reuses the pools instead of opening new ones.
const store = globalThis as typeof globalThis & {
	__daybookPools?: Partial<Record<PoolName, Pool>>;
};

function getPool(name: PoolName): Pool {
	const pools = (store.__daybookPools ??= {});
	let pool = pools[name];
	if (!pool) {
		pool = new Pool(poolConfig(name, serverEnv()[URL_VARIABLE[name]]));
		// An idle connection that drops (Neon suspending, a network blip) emits "error" on the
		// pool. Unhandled, it would crash the process; the next query simply reconnects.
		pool.on("error", (error) => {
			console.error(
				`Idle connection in the ${name} pool failed:`,
				error.message,
			);
		});
		pools[name] = pool;
	}
	return pool;
}

/** Better Auth's pool: the auth tables only. Imported by `server/auth` alone. */
export const authPool = (): Pool => getPool("auth");

/** Every user request, through the data access layer, under row-level security. */
export const runtimePool = (): Pool => getPool("runtime");

/** The system module only: Stripe sync, seeding, the daily pass (SRV-5). */
export const systemPool = (): Pool => getPool("system");
