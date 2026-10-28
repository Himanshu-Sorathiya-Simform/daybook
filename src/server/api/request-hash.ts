import "server-only";
import { createHash } from "node:crypto";

/** `value` as canonical JSON: object keys sorted at every level, no whitespace. Two bodies
 * that mean the same, however a client serialized them, give the same text (D-432). */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const entries = Object.keys(value)
			.sort((a, b) => a.localeCompare(b, "en"))
			.map(
				(key) =>
					`${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
			);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
}

/** An idempotency record's `request_hash` (BR-P2-18, D-432): SHA-256, as hex, of the method,
 * the path with its query string and the body's canonical JSON, one per line. */
export function requestHash(method: string, url: URL, body: unknown): string {
	return createHash("sha256")
		.update(
			`${method.toUpperCase()}\n${url.pathname}${url.search}\n${canonicalJson(body)}`,
		)
		.digest("hex");
}
