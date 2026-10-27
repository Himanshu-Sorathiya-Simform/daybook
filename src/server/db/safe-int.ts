import "server-only";

const INTEGER = /^-?\d+$/;

/** Turns an integer from the database into a number, or throws. `pg` returns `bigint`,
 * `numeric` and `count(*)` results as strings; a plain `Number()` would round anything past
 * `Number.MAX_SAFE_INTEGER` without a word, and a wrong total is worse than an error (MON-6,
 * BR-P2-22). Use it as Drizzle's `.mapWith(safeInt)` on every raw SQL aggregate. */
export function safeInt(value: unknown): number {
	if (typeof value === "number") {
		if (Number.isSafeInteger(value)) return value;
		throw new RangeError(
			`Expected a safe integer from the database, got ${value}`,
		);
	}
	if (typeof value === "bigint") return fromBigInt(value);
	if (typeof value === "string" && INTEGER.test(value))
		return fromBigInt(BigInt(value));
	throw new TypeError(
		`Expected an integer from the database, got ${value === null ? "null" : typeof value}`,
	);
}

function fromBigInt(value: bigint): number {
	if (
		value > BigInt(Number.MAX_SAFE_INTEGER)
		|| value < BigInt(Number.MIN_SAFE_INTEGER)
	) {
		throw new RangeError(
			"An integer from the database is outside the safe range for a JavaScript number",
		);
	}
	return Number(value);
}
