import "server-only";
import { randomUUIDv7 } from "node:crypto";
import { parseCookies } from "../auth/session-expired";
import { ApiError } from "./errors";

/** The largest JSON body a route accepts (BR-P2-17, step 3). */
export const BODY_LIMIT = 64 * 1024;

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** POST, PUT, PATCH and DELETE are mutations (BR-P2-16). */
export function isMutation(method: string): boolean {
	return MUTATIONS.has(method.toUpperCase());
}

/** Whether a `Content-Type` is JSON, ignoring parameters such as `charset` (step 2). */
export function isJsonMediaType(contentType: string | null): boolean {
	const essence = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
	return essence === "application/json";
}

/** The request body as text, refused with 413 above `limit` bytes (step 3). A declared
 * `Content-Length` over the limit is refused before reading; otherwise the stream is counted
 * as it arrives and abandoned once it passes the limit, so a client cannot make the server
 * buffer more. Invalid UTF-8 is a 400. */
export async function readBody(
	request: Request,
	limit = BODY_LIMIT,
): Promise<string> {
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (declared > limit) throw new ApiError("payload_too_large");
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			throw new ApiError("payload_too_large");
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new ApiError("bad_request");
	}
}

/** The request's `Origin` must be exactly `APP_ORIGIN`; a missing one fails (step 4). */
export function checkOrigin(request: Request, origin: string): void {
	if (request.headers.get("origin") !== origin) throw new ApiError("cross_origin");
}

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string | null | undefined): value is string {
	return typeof value === "string" && UUID_V7.test(value);
}

/** The request id: the `x-request-id` that `proxy.ts` sets when it is a UUIDv7, or a new one,
 * so a handler called without the proxy still has one (step 1, D-436). */
export function requestIdOf(headers: Headers): string {
	const given = headers.get("x-request-id");
	return isUuidV7(given) ? given.toLowerCase() : randomUUIDv7();
}

const MAX_VERSION = 2_147_483_647;

/** The version in `If-Match: "<version>"` (API-4), or `null` when it is missing or is not a
 * quoted whole number from 1 to the largest integer column value (step 6). */
export function parseIfMatch(header: string | null): number | null {
	const match = /^"([1-9][0-9]{0,9})"$/.exec(header ?? "");
	if (!match) return null;
	const version = Number(match[1]);
	return version <= MAX_VERSION ? version : null;
}

/** Whether the client says Subscription items wait in its queue: the `Daybook-Queue: pending`
 * header, or the `daybook_queue=pending` cookie (BR-P2-14). Catch-up is skipped then. */
export function queuePending(headers: Headers): boolean {
	return (
		headers.get("daybook-queue") === "pending"
		|| parseCookies(headers.get("cookie")).get("daybook_queue") === "pending"
	);
}
