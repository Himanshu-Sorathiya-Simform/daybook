import { randomUUIDv7 } from "node:crypto";

import { serverEnv } from "../../env";

/** A route handler as `route(...)` returns it. */
type Handler = (
	request: Request,
	context?: { params?: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

export type Answer = {
	status: number;
	/** The parsed JSON body, or null for an empty one. */
	body: unknown;
	headers: Headers;
};

export type CallOptions = {
	cookie?: string;
	params?: Record<string, string>;
	/** `GET` by default. Any other method sends JSON from the app's origin with a fresh
	 * `Idempotency-Key`, as the app's client does (BR-P2-17). */
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	body?: unknown;
	/** The body as text, sent as it is instead of `body`: JSON the helper would not write, such
	 * as `null`, or a nesting too deep for `JSON.stringify`. */
	rawBody?: string;
	/** Extra headers; `null` removes one the call would otherwise send. */
	headers?: Record<string, string | null>;
};

/**
 * Calls a route handler as the app's client does: the session cookie, the route's params as
 * Next passes them, at `APP_ORIGIN`. The caller freezes the clock
 * (`vi.useFakeTimers({ toFake: ["Date"] })`), as every endpoint test runs at the golden one.
 */
export async function call(
	handler: Handler,
	path: string,
	{
		cookie,
		params = {},
		method = "GET",
		body,
		rawBody,
		headers = {},
	}: CallOptions = {},
): Promise<Answer> {
	const origin = serverEnv().APP_ORIGIN;
	const mutation = method !== "GET";
	const all: Record<string, string | null> = {
		...(mutation ?
			{
				"content-type": "application/json",
				origin,
				"idempotency-key": randomUUIDv7(),
			}
		:	{}),
		...(cookie ? { cookie } : {}),
		...headers,
	};
	const request = new Request(`${origin}${path}`, {
		method,
		headers: Object.fromEntries(
			Object.entries(all).filter(
				(entry): entry is [string, string] => entry[1] !== null,
			),
		),
		...(mutation ? { body: rawBody ?? JSON.stringify(body ?? {}) } : {}),
	});
	const response = await handler(request, { params: Promise.resolve(params) });
	const text = await response.text();
	return {
		status: response.status,
		body: text ? JSON.parse(text) : null,
		headers: response.headers,
	};
}
