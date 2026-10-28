import "server-only";
import type { PoolClient } from "pg";

/** One request's `Server-Timing` (API-8, P2 section 5): `db;dur` sums the time of every query
 * the request ran, and `app;dur` runs from the wrapper's first step to the response. Both are
 * whole milliseconds, from the monotonic clock, never the request clock. */
export class Timing {
	readonly #start = performance.now();
	#db = 0;

	/** Adds one query's duration, in milliseconds. */
	addDb(ms: number): void {
		this.#db += ms;
	}

	get db(): number {
		return this.#db;
	}

	header(): string {
		const app = performance.now() - this.#start;
		return `db;dur=${Math.round(this.#db)}, app;dur=${Math.round(app)}`;
	}
}

/** Times every query on `client` into `timing` until the returned function restores it.
 * Drizzle and raw queries both go through `client.query`, so nothing escapes (D-436). */
export function timeQueries(client: PoolClient, timing: Timing): () => void {
	const original = client.query;
	client.query = ((...args: unknown[]) => {
		const started = performance.now();
		const result = (original as (...a: unknown[]) => unknown).apply(
			client,
			args,
		);
		if (result instanceof Promise) {
			return result.finally(() => timing.addDb(performance.now() - started));
		}
		timing.addDb(performance.now() - started);
		return result;
	}) as typeof client.query;
	return () => {
		client.query = original;
	};
}
