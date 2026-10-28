import "server-only";
import { randomUUIDv7 } from "node:crypto";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isJsonMediaType, isMutation } from "../api/checks";
import { ApiError, envelope } from "../api/errors";
import { LOGOUT_COOKIE, parseCookies } from "../auth/session-expired";
import { buildCsp, newNonce, securityHeaders } from "./csp";

/** Routes that need a session (root spec, section 4). `/` decides on its own (F01), and
 * `/print/*` uses a print token (BR-P2-42), so neither is listed. */
const LOGGED_IN = [
	"/onboarding",
	"/dashboard",
	"/transactions",
	"/budgets",
	"/subscriptions",
	"/goals",
	"/investments",
	"/analytics",
	"/insights",
	"/reports",
	"/settings",
];

const LOGGED_OUT = ["/login", "/signup"];

/** Pages the logout marker never redirects, so logging out can finish (BR-P2-29). */
const LOGOUT_EXEMPT = ["/login", "/signup", "/offline"];

/** API paths that check their own origin: Better Auth's, and signed webhooks (BR-P2-31). */
const OWN_ORIGIN_CHECK = ["/api/auth", "/api/webhooks"];

/** The page's path and query, for `readAsUser`'s `next` (D-440). */
export const PATH_HEADER = "x-daybook-path";

const under = (path: string, prefixes: string[]) =>
	prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export type ProxyOptions = { origin: string; development: boolean };

/** Everything `proxy.ts` does (BR-P2-28 to BR-P2-32, D-172), in order:
 *
 * 1. **Request id:** a new UUIDv7 on the forwarded request and the response, replacing any
 *    the client sent (BR-P2-30).
 * 2. **API:** a mutation outside `/api/auth` and `/api/webhooks` is refused early when it is
 *    not JSON (415) or not from `APP_ORIGIN` (403), with the same checks the route wrapper
 *    runs again (BR-P2-31, D-441). API responses get the security headers, never the CSP.
 * 3. **Pages, redirects by cookie presence only, with no database call (BR-P2-29):**
 *    - the logout marker sends any page but login, signup and offline to
 *      `/api/session/expired?reason=logout`;
 *    - no session cookie on a logged-in route goes to `/login?next=<path>`;
 *    - a session cookie on login or signup goes to `/dashboard`, unless `expired=1`.
 * 4. **Pages:** a fresh nonce; the CSP, `x-nonce` and the page's path go on the forwarded
 *    request, where Next.js and the root layout read them, and the CSP on the response
 *    (BR-P2-32). */
export function handleProxy(
	request: NextRequest,
	{ origin, development }: ProxyOptions,
): NextResponse {
	const requestId = randomUUIDv7();
	const { pathname, search, searchParams } = request.nextUrl;
	const finish = (response: NextResponse) => {
		response.headers.set("x-request-id", requestId);
		for (const [name, value] of Object.entries(securityHeaders(origin))) {
			response.headers.set(name, value);
		}
		return response;
	};
	const redirect = (target: string) =>
		finish(NextResponse.redirect(new URL(target, origin)));
	const forwarded = new Headers(request.headers);
	forwarded.set("x-request-id", requestId);

	if (under(pathname, ["/api"])) {
		if (isMutation(request.method) && !under(pathname, OWN_ORIGIN_CHECK)) {
			const refusal =
				!isJsonMediaType(request.headers.get("content-type")) ?
					new ApiError("unsupported_media_type")
				: request.headers.get("origin") !== origin ?
					new ApiError("cross_origin")
				:	null;
			if (refusal) {
				return finish(
					NextResponse.json(envelope(refusal, requestId), {
						status: refusal.status,
					}),
				);
			}
		}
		return finish(NextResponse.next({ request: { headers: forwarded } }));
	}

	const cookies = parseCookies(request.headers.get("cookie"));
	if (cookies.get(LOGOUT_COOKIE) === "1" && !under(pathname, LOGOUT_EXEMPT)) {
		return redirect("/api/session/expired?reason=logout");
	}
	const hasSession =
		getSessionCookie(request, { cookiePrefix: "daybook" }) !== null;
	if (!hasSession && under(pathname, LOGGED_IN)) {
		return redirect(
			`/login?${new URLSearchParams({ next: `${pathname}${search}` })}`,
		);
	}
	if (
		hasSession
		&& under(pathname, LOGGED_OUT)
		&& searchParams.get("expired") !== "1"
	) {
		return redirect("/dashboard");
	}

	const nonce = newNonce();
	const csp = buildCsp(nonce, { origin, development });
	forwarded.set("x-nonce", nonce);
	forwarded.set("content-security-policy", csp);
	forwarded.set(PATH_HEADER, `${pathname}${search}`);
	const response = NextResponse.next({ request: { headers: forwarded } });
	response.headers.set("content-security-policy", csp);
	return finish(response);
}
