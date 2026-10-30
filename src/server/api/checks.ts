import "server-only";
import { randomUUIDv7 } from "node:crypto";
import { parseCookies } from "../auth/session-expired";
import { isUuidV7 } from "@/lib/ids";
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

/** How many arrays and objects deep a JSON body may nest (step 13, D-491). Every body a route
 * takes is at most three deep; the 64 KB limit alone lets one nest 65,000 deep. */
export const MAX_JSON_DEPTH = 32;

/** Whether parsed JSON nests arrays and objects more than `limit` levels deep. It walks with
 * its own stack, so no depth can overflow the call stack, as recursion over the body can. */
export function tooDeep(value: unknown, limit = MAX_JSON_DEPTH): boolean {
	const stack: [unknown, number][] = [[value, 0]];
	while (stack.length > 0) {
		const [item, depth] = stack.pop() as [unknown, number];
		if (item === null || typeof item !== "object") continue;
		if (depth + 1 > limit) return true;
		for (const child of Object.values(item)) stack.push([child, depth + 1]);
	}
	return false;
}

/** The request's `Origin` must be exactly `APP_ORIGIN`; a missing one fails (step 4). */
export function checkOrigin(request: Request, origin: string): void {
	if (request.headers.get("origin") !== origin) throw new ApiError("cross_origin");
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
	const match = /^"([1-9]\d{0,9})"$/.exec(header ?? "");
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
