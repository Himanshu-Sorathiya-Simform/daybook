import "server-only";
import { type ApiError, envelope } from "./errors";
import type { Timing } from "./timing";

const REPLY = Symbol("reply");

/** A handler's answer with a status other than 200 (BR-P2-15, D-438). */
export type Reply<T> = { readonly [REPLY]: true; data: T; status: number };

export function reply<T>(
	data: T,
	{ status = 200 }: { status?: number } = {},
): Reply<T> {
	return { [REPLY]: true, data, status };
}

export function isReply(value: unknown): value is Reply<unknown> {
	return typeof value === "object" && value !== null && REPLY in value;
}

/** A handler's answer as a status and the body text (root API-11, D-431): the value inside
 * `{ "data": ... }`, or no body for a 204. */
export function successOf(result: unknown): { status: number; body: string | null } {
	const { data, status } =
		isReply(result) ? result : { data: result, status: 200 };
	return { status, body: status === 204 ? null : JSON.stringify({ data }) };
}

export type ResponseMeta = { requestId: string; timing: Timing };

/** A response with the headers every route answer carries (API-8). */
export function respond(
	status: number,
	body: string | null,
	{ requestId, timing }: ResponseMeta,
): Response {
	const headers = new Headers({
		"x-request-id": requestId,
		"server-timing": timing.header(),
	});
	if (body !== null) headers.set("content-type", "application/json");
	return new Response(body, { status, headers });
}

/** An error answer in the envelope (API-9). A read's `internal` message says nothing was
 * saved only for writes. */
export function respondError(
	error: ApiError,
	meta: ResponseMeta,
	{ read }: { read: boolean },
): Response {
	return respond(
		error.status,
		JSON.stringify(envelope(error, meta.requestId, { read })),
		meta,
	);
}
