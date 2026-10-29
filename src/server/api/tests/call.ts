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

/**
 * Calls a route handler with a `GET` as the app's client sends it: the session cookie, the
 * route's params as Next passes them, at `APP_ORIGIN`. The caller freezes the clock
 * (`vi.useFakeTimers({ toFake: ["Date"] })`), as every endpoint test runs at the golden one.
 */
export async function call(
	handler: Handler,
	path: string,
	{
		cookie,
		params = {},
	}: { cookie?: string; params?: Record<string, string> } = {},
): Promise<Answer> {
	const request = new Request(`${serverEnv().APP_ORIGIN}${path}`, {
		headers: cookie ? { cookie } : {},
	});
	const response = await handler(request, { params: Promise.resolve(params) });
	const text = await response.text();
	return {
		status: response.status,
		body: text ? JSON.parse(text) : null,
		headers: response.headers,
	};
}
